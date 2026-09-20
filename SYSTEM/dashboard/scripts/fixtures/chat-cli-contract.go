// Synthetic HTTP interoperability only: no model, installed profile, or VM.
package main

import (
	"context"
	"fmt"
	"os"
	"reflect"

	"github.com/Maximilien-ai/clawmax-cli/src/pkg/instanceclient"
)

func main() {
	client, err := instanceclient.New(os.Args[1], "alice", "rc6-contract", nil)
	if err != nil {
		panic(err)
	}
	request := instanceclient.ChatRequest{
		APIVersion: "clawmax.instance/v1", Kind: "AgentChatRequest",
		Message: "Synthetic greeting", IdempotencyKey: "go-contract",
	}
	var previous []instanceclient.ChatEvent
	for i := 0; i < 2; i++ {
		var events []instanceclient.ChatEvent
		err = client.StreamChat(context.Background(), "test", "analyst", request, func(event instanceclient.ChatEvent) error {
			events = append(events, event)
			return nil
		})
		if err != nil {
			panic(err)
		}
		if len(events) != 3 || events[0].Type != "start" || events[1].Content != "Hello 🌍" || events[2].Type != "done" {
			panic("unexpected chat events")
		}
		if i == 1 && !reflect.DeepEqual(previous, events) {
			panic("idempotent replay changed events")
		}
		previous = events
	}
	fmt.Println("CLI strict Go chat client: completion and replay passed")
}
