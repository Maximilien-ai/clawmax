// Real CLI client interoperability against an explicitly isolated native harness.
// Credentials arrive on stdin, never command-line arguments or output.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"time"

	"github.com/Maximilien-ai/clawmax-cli/src/pkg/instanceclient"
)

func main() {
	var input struct{ Origin, Token, Workspace, Agent string }
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic("invalid isolated client input")
	}
	client, err := instanceclient.New(input.Origin, input.Token, "native-template-acceptance", nil)
	if err != nil {
		panic("cannot initialize isolated client")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	request := instanceclient.NewChatRequest("Reply with a short greeting. Do not use tools.", "", "native-go-client-greeting")
	var previous []instanceclient.ChatEvent
	for i := 0; i < 2; i++ {
		var events []instanceclient.ChatEvent
		err = client.StreamChat(ctx, input.Workspace, input.Agent, request, func(event instanceclient.ChatEvent) error {
			events = append(events, event)
			return nil
		})
		if err != nil {
			panic("isolated native chat failed")
		}
		if len(events) < 3 || events[0].Type != "start" || events[len(events)-1].Type != "done" {
			panic("missing terminal reply")
		}
		var reply strings.Builder
		for _, event := range events {
			if event.Type == "delta" {
				reply.WriteString(event.Content)
			}
		}
		if strings.TrimSpace(reply.String()) == "" {
			panic("empty native reply")
		}
		if i == 1 && !reflect.DeepEqual(previous, events) {
			panic("durable replay changed events")
		}
		previous = events
	}
	fmt.Println("CLI Go client: native reply and durable replay passed")
}
