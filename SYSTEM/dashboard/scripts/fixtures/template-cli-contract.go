// Run from a clawmax-cli checkout; imports its real strict clients and validator.
package main

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"runtime"

	"github.com/Maximilien-ai/clawmax-cli/src/pkg/instanceclient"
	"github.com/Maximilien-ai/clawmax-cli/src/pkg/portabletemplate"
)

func check(err error) {
	if err != nil {
		panic(err)
	}
}
func require(ok bool, message string) {
	if !ok {
		panic(message)
	}
}

func main() {
	ctx := context.Background()
	bundle, err := portabletemplate.Validate(os.Args[2])
	check(err)
	client, err := instanceclient.New(os.Args[1], "synthetic-contract-token", "source-contract", nil)
	check(err)
	capabilities, err := client.Capabilities(ctx, "contract")
	check(err)
	// The harness starts Dashboard on this host, not in a Linux worker.
	require(capabilities.Runtime.OperatingSystem == runtime.GOOS, "Dashboard must report the actual host OS")
	require(capabilities.Runtime.Architecture == runtime.GOARCH, "Dashboard must report the actual host architecture")
	require(reflect.DeepEqual(capabilities.Templates.Operations, []string{"import", "list", "remove", "show", "validate", "versions"}), "Catalog must not advertise unsupported plan/apply or export")
	require(len(capabilities.WorkspacePackage.Formats) == 0 && len(capabilities.WorkspacePackage.Operations) == 0, "Workspace package support must remain unavailable")
	require(len(capabilities.Skills.Formats) == 0 && len(capabilities.Skills.Platforms) == 0 && len(capabilities.Skills.Operations) == 0, "Native catalog discovery must not imply Linux Skill execution")
	require(!capabilities.Communities.Available, "Community support must remain unavailable")
	require(!capabilities.Groups.Permanent && len(capabilities.Groups.Operations) == 0, "Group execution must remain unavailable")
	require(!capabilities.Workflows.Scheduling && len(capabilities.Workflows.Operations) == 0, "Workflow execution must remain unavailable")
	fmt.Printf("Catalog capabilities: %s/%s; unsupported execution capabilities absent\n", capabilities.Runtime.OperatingSystem, capabilities.Runtime.Architecture)
	upload := instanceclient.TemplateUpload{Filename: os.Args[2], Key: bundle.Manifest.Key, Version: bundle.Manifest.Version, BundleSHA256: bundle.SHA256, IdempotencyKey: "contract-import"}
	validated, err := client.ValidateTemplateUpload(ctx, "contract", upload)
	check(err)
	require(validated.Valid && validated.ArtifactCount == 4, "validated graph mismatch")
	imported, err := client.ImportTemplate(ctx, "contract", upload)
	check(err)
	require(imported.Created, "first import did not create")
	replay, err := client.ImportTemplate(ctx, "contract", upload)
	check(err)
	require(!replay.Created && replay.Template.ID == imported.Template.ID, "idempotent replay mismatch")
	shown, err := client.Template(ctx, "contract", imported.Template.ID)
	check(err)
	require(shown.ID == imported.Template.ID, "show identity mismatch")
	listed, err := client.Templates(ctx, "contract")
	check(err)
	require(len(listed.Items) == 1, "list mismatch")
	nextBundle, err := portabletemplate.Validate(os.Args[3])
	check(err)
	nextUpload := instanceclient.TemplateUpload{Filename: os.Args[3], Key: nextBundle.Manifest.Key, Version: nextBundle.Manifest.Version, BundleSHA256: nextBundle.SHA256, IdempotencyKey: "contract-import-v2"}
	nextImported, err := client.ImportTemplate(ctx, "contract", nextUpload)
	check(err)
	require(nextImported.Created && nextImported.Template.ID != imported.Template.ID, "version identity mismatch")
	versions, err := client.TemplateVersions(ctx, "contract", bundle.Manifest.Key)
	check(err)
	require(len(versions.Items) == 2 && versions.Items[0].Version == "1.1.0" && versions.Items[1].Version == "1.0.0", "versions mismatch")
	for i := 0; i < 2; i++ {
		removed, err := client.RemoveTemplate(ctx, "contract", imported.Template.ID, "contract-remove")
		check(err)
		require(removed.Removed, "remove replay mismatch")
	}
	_, err = client.RemoveTemplate(ctx, "contract", nextImported.Template.ID, "contract-remove-v2")
	check(err)
	listed, err = client.Templates(ctx, "contract")
	check(err)
	require(len(listed.Items) == 0, "removed template remains visible")
	fmt.Println("CLI Go validator + Dashboard HTTP catalog contract: passed")
}
