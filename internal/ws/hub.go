package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 65536
	sendBufSize    = 256
)

// Message is the WebSocket protocol envelope.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Client represents a single WebSocket connection.
type Client struct {
	ID     string
	Name   string
	RoomID string
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	mu     sync.Mutex
}

// Room holds connected clients and chat history.
type Room struct {
	ID       string
	Name     string
	Clients  map[string]*Client
	Messages []ChatMessage
	mu       sync.RWMutex
}

// ChatMessage is a single chat entry.
type ChatMessage struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	UserName  string `json:"userName"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}

// Hub manages rooms and client connections.
type Hub struct {
	clients    map[string]*Client
	rooms      map[string]*Room
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		rooms:      make(map[string]*Room),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Client connected: %s", client.ID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				h.leaveRoom(client)
				delete(h.clients, client.ID)
				close(client.Send)
				log.Printf("Client disconnected: %s", client.ID)
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) GetRoom(id string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[id]
}

func (h *Hub) CreateRoom(name string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	room := &Room{
		ID:       uuid.New().String()[:8],
		Name:     name,
		Clients:  make(map[string]*Client),
		Messages: make([]ChatMessage, 0),
	}
	h.rooms[room.ID] = room
	return room
}

func (h *Hub) DeleteRoom(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, id)
}

func (h *Hub) joinRoom(client *Client, roomID, name string) *Room {
	client.Name = name
	room := h.GetRoom(roomID)
	if room == nil {
		return nil
	}

	room.mu.Lock()
	client.RoomID = roomID
	room.Clients[client.ID] = client
	room.mu.Unlock()

	// Notify others in room
	h.broadcastToRoom(roomID, Message{
		Type: "user-joined",
		Payload: mustMarshal(map[string]interface{}{
			"userId":   client.ID,
			"userName": client.Name,
		}),
	}, "")

	return room
}

func (h *Hub) leaveRoom(client *Client) {
	if client.RoomID == "" {
		return
	}
	room := h.GetRoom(client.RoomID)
	if room == nil {
		return
	}

	room.mu.Lock()
	delete(room.Clients, client.ID)
	remaining := len(room.Clients)
	room.mu.Unlock()

	// Notify remaining participants
	h.broadcastToRoom(client.RoomID, Message{
		Type: "user-left",
		Payload: mustMarshal(map[string]interface{}{
			"userId": client.ID,
		}),
	}, "")

	// Delete empty rooms
	if remaining == 0 {
		h.DeleteRoom(client.RoomID)
	}

	client.RoomID = ""
}

func (h *Hub) broadcastToRoom(roomID string, msg Message, excludeID string) {
	room := h.GetRoom(roomID)
	if room == nil {
		return
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("broadcast marshal error: %v", err)
		return
	}

	room.mu.RLock()
	defer room.mu.RUnlock()
	for id, client := range room.Clients {
		if id == excludeID {
			continue
		}
		select {
		case client.Send <- data:
		default:
			log.Printf("Client %s send buffer full, dropping message", id)
		}
	}
}

func (h *Hub) sendToClient(clientID string, msg Message) {
	h.mu.RLock()
	client, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("send marshal error: %v", err)
		return
	}

	select {
	case client.Send <- data:
	default:
		log.Printf("Client %s send buffer full, dropping message", clientID)
	}
}

// ServeWs upgrades HTTP to WebSocket and starts client pumps.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		ID:   uuid.New().String(),
		Conn: conn,
		Send: make(chan []byte, sendBufSize),
		Hub:  hub,
	}

	hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Invalid message: %v", err)
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "create-room":
		var payload struct {
			RoomName string `json:"roomName"`
			UserName string `json:"userName"`
		}
		json.Unmarshal(msg.Payload, &payload)
		if payload.RoomName == "" {
			payload.RoomName = "Room"
		}
		if payload.UserName == "" {
			payload.UserName = "User"
		}

		room := c.Hub.CreateRoom(payload.RoomName)
		c.Hub.joinRoom(c, room.ID, payload.UserName)

		c.Hub.sendToClient(c.ID, Message{
			Type: "room-created",
			Payload: mustMarshal(map[string]interface{}{
				"roomId":   room.ID,
				"roomName": room.Name,
				"userId":   c.ID,
			}),
		})

	case "join-room":
		var payload struct {
			RoomID string `json:"roomId"`
			Name   string `json:"name"`
		}
		json.Unmarshal(msg.Payload, &payload)

		room := c.Hub.joinRoom(c, payload.RoomID, payload.Name)
		if room == nil {
			c.Hub.sendToClient(c.ID, Message{
				Type: "error",
				Payload: mustMarshal(map[string]string{
					"message": "Room not found",
				}),
			})
			return
		}

		// Send room info to the joining client
		room.mu.RLock()
		participants := make([]map[string]string, 0, len(room.Clients))
		for _, cl := range room.Clients {
			if cl.ID != c.ID {
				participants = append(participants, map[string]string{
					"userId":   cl.ID,
					"userName": cl.Name,
				})
			}
		}
		room.mu.RUnlock()

		c.Hub.sendToClient(c.ID, Message{
			Type: "room-joined",
			Payload: mustMarshal(map[string]interface{}{
				"roomId":       room.ID,
				"roomName":     room.Name,
				"userId":       c.ID,
				"participants": participants,
			}),
		})

		// Send chat history to the joining client
		room.mu.RLock()
		chatHistory := make([]ChatMessage, len(room.Messages))
		copy(chatHistory, room.Messages)
		room.mu.RUnlock()

		if len(chatHistory) > 0 {
			c.Hub.sendToClient(c.ID, Message{
				Type: "chat-history",
				Payload: mustMarshal(map[string]interface{}{
					"messages": chatHistory,
				}),
			})
		}

	case "offer", "answer", "ice-candidate":
		// Relay to all other participants in the room (only 1 other for 1-on-1)
		c.Hub.broadcastToRoom(c.RoomID, msg, c.ID)

	case "chat-message":
		var payload struct {
			Text string `json:"text"`
		}
		json.Unmarshal(msg.Payload, &payload)

		chatMsg := ChatMessage{
			ID:        uuid.New().String(),
			UserID:    c.ID,
			UserName:  c.Name,
			Text:      payload.Text,
			Timestamp: time.Now().UnixMilli(),
		}

		// Store in room history
		room := c.Hub.GetRoom(c.RoomID)
		if room != nil {
			room.mu.Lock()
			room.Messages = append(room.Messages, chatMsg)
			room.mu.Unlock()
		}

		// Broadcast to all (including sender for confirmation)
		c.Hub.broadcastToRoom(c.RoomID, Message{
			Type: "chat-message",
			Payload: mustMarshal(chatMsg),
		}, "")

	case "toggle-media":
		// Broadcast media status changes to other participants
		c.Hub.broadcastToRoom(c.RoomID, msg, c.ID)
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
