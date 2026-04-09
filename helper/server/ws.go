package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/delwing/arkadia-web-client-extension/helper/protocol"
)

// wsConn wraps a single WebSocket connection.
type wsConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// Send marshals and writes a message to the WebSocket.
func (c *wsConn) Send(msg any) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return c.conn.Write(ctx, websocket.MessageText, data)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("websocket accept error: %v", err)
		return
	}

	client := &wsConn{conn: conn}
	s.addClient(client)
	defer func() {
		conn.CloseNow()
		s.removeClient(client)
		log.Println("WebSocket cleanup complete")
	}()

	log.Println("WebSocket client connected")

	for {
		_, data, err := conn.Read(context.Background())
		if err != nil {
			log.Printf("WebSocket read ended: %v", err)
			return
		}

		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			log.Printf("invalid message: %v", err)
			continue
		}

		if env.Type == protocol.TypePing {
			if err := client.Send(protocol.NewPongMsg()); err != nil {
				log.Printf("pong send error: %v", err)
			}
			continue
		}

		if s.handler != nil {
			responses := s.handler(env)
			for _, resp := range responses {
				if err := client.Send(resp); err != nil {
					log.Printf("response send error: %v", err)
				}
			}
		}
	}
}

const idleTimeout = 10 * time.Second

func (s *Server) addClient(c *wsConn) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	s.clients = append(s.clients, c)
	// Stop idle timer — we have a client
	s.idleMu.Lock()
	if s.idleTimer != nil {
		s.idleTimer.Stop()
	}
	s.idleMu.Unlock()
}

func (s *Server) removeClient(c *wsConn) {
	s.clientsMu.Lock()
	for i, cl := range s.clients {
		if cl == c {
			s.clients = append(s.clients[:i], s.clients[i+1:]...)
			break
		}
	}
	remaining := len(s.clients)
	s.clientsMu.Unlock()

	log.Printf("Client disconnected, %d remaining", remaining)
	if remaining == 0 {
		if s.onDisconnectAll != nil {
			s.onDisconnectAll()
		}
		s.resetIdleTimer(idleTimeout)
	}
}
