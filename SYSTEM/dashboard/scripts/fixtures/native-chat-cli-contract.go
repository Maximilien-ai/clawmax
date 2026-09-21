// Real CLI client interoperability against an explicitly isolated native harness.
// Credentials arrive on stdin, never command-line arguments or output.
package main

import (
	"context"
	"encoding/json"
	"errors"
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
	groups, err := client.Groups(ctx, input.Workspace)
	if err != nil || len(groups.Items) == 0 {
		panic("isolated group discovery failed")
	}
	for _, listed := range groups.Items {
		group, err := client.Group(ctx, input.Workspace, listed.ID)
		if err != nil || !reflect.DeepEqual(group, listed) || group.Status != "unavailable" {
			panic("isolated group detail or execution gate mismatch")
		}
		_, err = client.GroupMessages(ctx, input.Workspace, listed.ID)
		var apiError *instanceclient.APIError
		if !errors.As(err, &apiError) || apiError.Code != "group_history_unavailable" {
			panic("uncorrelated group history must remain unavailable")
		}
		err = client.StreamGroupChat(ctx, input.Workspace, listed.ID, instanceclient.NewGroupChatRequest("Must not execute", "", "gated-group"), func(instanceclient.GroupChatEvent) error {
			panic("gated group emitted an execution event")
		})
		if !errors.As(err, &apiError) || apiError.Code != "group_execution_unavailable" {
			panic("group execution must remain unavailable")
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
