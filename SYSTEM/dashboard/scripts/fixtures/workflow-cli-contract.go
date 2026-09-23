// Strict client interoperability against synthetic runtime evidence only.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/Maximilien-ai/clawmax-cli/src/pkg/instanceclient"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	ctx := context.Background()
	client, err := instanceclient.New(os.Args[1], "go-actor", "rc6-contract", nil)
	must(err)
	_, err = client.Workflow(ctx, "test", "review")
	must(err)
	request := instanceclient.NewWorkflowRunRequest(nil, "go-start")
	run, err := client.StartWorkflow(ctx, "test", "review", request)
	must(err)
	replay, err := client.StartWorkflow(ctx, "test", "review", request)
	must(err)
	if replay.ID != run.ID {
		panic("duplicate dispatch")
	}
	_, err = client.WorkflowRun(ctx, "test", run.ID)
	must(err)
	result, err := client.WorkflowResult(ctx, "test", run.ID)
	must(err)
	if result.Status != "succeeded" || len(result.Output) == 0 {
		panic("missing result")
	}
	list, err := client.WorkflowRuns(ctx, "test", "review")
	must(err)
	if len(list.Items) != 1 {
		panic("actor run list mismatch")
	}
	_, err = client.CancelWorkflowRun(ctx, "test", run.ID, instanceclient.NewWorkflowRunCancelRequest("go-too-late"))
	if err == nil {
		panic("completed run should not be reported cancelled")
	}
	active, err := client.StartWorkflow(ctx, "test", "cancellable", instanceclient.NewWorkflowRunRequest(nil, "go-active"))
	must(err)
	cancelled, err := client.CancelWorkflowRun(ctx, "test", active.ID, instanceclient.NewWorkflowRunCancelRequest("go-cancel"))
	must(err)
	if cancelled.Status != "cancelled" {
		panic("cancellation was not terminal")
	}
	fmt.Println("CLI strict Go workflow client: detail, start, replay, list, result and terminal cancellation passed")
}
