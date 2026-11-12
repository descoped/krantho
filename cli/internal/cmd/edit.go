package cmd

import (
	tea "charm.land/bubbletea/v2"
	"github.com/spf13/cobra"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/tui"
)

// runProgram runs a bubbletea model as a full-screen program. A seam so
// command tests can intercept the constructed model instead of entering
// the terminal. The editor's View sets AltScreen, so the alternate screen
// is requested declaratively rather than as a program option.
var runProgram = func(model tea.Model) error {
	_, err := tea.NewProgram(model).Run()
	return err
}

func newContentEditCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "edit <collection> <slug>",
		Short:        "Edit a document in the terminal editor",
		Args:         cobra.ExactArgs(2),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			return runContentEdit(opts, args[0], args[1])
		},
	}
}

// runContentEdit loads the document and its collection schema through the
// session, then runs the editor full-screen with a save function closed
// over the session — the TUI itself never talks to the API.
func runContentEdit(opts *rootOptions, collection, slug string) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	doc, err := sess.GetContent(collection, slug)
	if err != nil {
		return err
	}
	schema, err := sess.GetSchema(collection)
	if err != nil {
		return err
	}
	save := func(fields map[string]any, body string, version int) (int, error) {
		req := api.UpdateContentRequest{Fields: fields, Body: body, Version: version}
		if _, err := sess.UpdateContent(collection, slug, req); err != nil {
			return 0, err
		}
		// update-content.ts's 200 body is { slug, collection, message } —
		// it carries no version. The append-only adapters write
		// MAX(version)+1 and the handler's 409 check pinned the stored
		// version to the asserted one, so the written version is
		// version+1. A racing writer in that window surfaces as a 409 on
		// the next :w — the server stays the arbiter.
		return version + 1, nil
	}
	return runProgram(tui.NewEditor(doc, schema, save))
}
