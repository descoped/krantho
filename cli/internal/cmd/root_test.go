package cmd

import (
	"bytes"
	"strings"
	"testing"
)

func TestRootHelp(t *testing.T) {
	root := newRootCmd("")

	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs([]string{"--help"})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute --help: %v", err)
	}

	got := out.String()
	for _, want := range []string{
		"krantho",
		"Terminal-first management for a krantho project via its REST API",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("help output missing %q\noutput:\n%s", want, got)
		}
	}
}
