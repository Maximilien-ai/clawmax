// Real CLI client interoperability against an explicitly isolated native harness.
// Credentials arrive on stdin, never command-line arguments or output.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
	// Four sequential local-model turns can exceed the client's 15-second
	// default. Match the explicit acceptance budget; do not change CLI defaults.
	client, err := instanceclient.New(input.Origin, input.Token, "native-template-acceptance", &http.Client{Timeout: 180 * time.Second})
	if err != nil {
		panic("cannot initialize isolated client")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	groups, err := client.Groups(ctx, input.Workspace)
	if err != nil || len(groups.Items) == 0 {
		panic("isolated group discovery failed")
	}
	for _, listed := range groups.Items {
		group, err := client.Group(ctx, input.Workspace, listed.ID)
		if err != nil || !reflect.DeepEqual(group, listed) || group.Status != "stopped" {
			panic("isolated group detail or execution gate mismatch")
		}
		history, err := client.GroupMessages(ctx, input.Workspace, listed.ID)
		if err != nil || len(history.Items) != 0 {
			panic("new isolated group history must be empty")
		}
		var previous []instanceclient.GroupChatEvent
		for attempt := 0; attempt < 2; attempt++ {
			var events []instanceclient.GroupChatEvent
			err = client.StreamGroupChat(ctx, input.Workspace, listed.ID, instanceclient.NewGroupChatRequest("Reply with one short sentence. Do not use tools.", "", "native-public-group"), func(event instanceclient.GroupChatEvent) error {
				events = append(events, event)
				return nil
			})
			if err != nil || len(events) != 6 || events[0].Type != "start" || events[5].Type != "done" || events[5].Content != "Group stopped: turn_limit" {
				panic("bounded public group run failed")
			}
			if attempt == 1 && !reflect.DeepEqual(previous, events) {
				panic("group replay changed events")
			}
			previous = events
		}
		history, err = client.GroupMessages(ctx, input.Workspace, listed.ID)
		if err != nil || len(history.Items) != 5 {
			panic("group history missing correlated replies")
		}
		for index := 0; index < 4; index++ {
			message := history.Items[index]
			event := previous[index+1]
			if message.Content != event.Content || message.SenderID != event.AgentID || message.SessionID != event.SessionID {
				panic("group history does not match execution")
			}
		}
	}
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
