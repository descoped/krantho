package output

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestMarkdownDocumentYAMLSafety proves the frontmatter block stays valid
// YAML for values a naive verbatim emitter would corrupt: colons, newlines,
// leading indicators, and strings that read as YAML keywords or numbers.
func TestMarkdownDocumentYAMLSafety(t *testing.T) {
	fields := map[string]any{
		"title":       "About Us",               // plain — stays verbatim
		"tagline":     "Foo: Bar",               // colon — must quote
		"description": "line one\nline two",     // newline — must quote+escape
		"flag":        "true",                   // YAML keyword — must quote
		"count":       "42",                     // reads as number — must quote
		"weird":       " leading and trailing ", // whitespace — must quote
		"featured":    true,                     // non-string — JSON as before
	}
	var b strings.Builder
	if err := MarkdownDocument(&b, fields, "Body text"); err != nil {
		t.Fatalf("MarkdownDocument: %v", err)
	}
	out := b.String()

	assertLine := func(line string) {
		t.Helper()
		if !strings.Contains(out, line+"\n") {
			t.Fatalf("output missing line %q:\n%s", line, out)
		}
	}
	assertLine("title: About Us")
	assertLine(`tagline: "Foo: Bar"`)
	assertLine(`description: "line one\nline two"`)
	assertLine(`flag: "true"`)
	assertLine(`count: "42"`)
	assertLine(`weird: " leading and trailing "`)
	assertLine("featured: true")

	// Every non-plain value must be a JSON string — itself valid YAML —
	// that decodes back to the original.
	for _, quoted := range []struct{ key, want string }{
		{"tagline", "Foo: Bar"},
		{"description", "line one\nline two"},
		{"flag", "true"},
	} {
		start := strings.Index(out, quoted.key+": ")
		if start < 0 {
			t.Fatalf("missing key %s", quoted.key)
		}
		line := out[start+len(quoted.key)+2:]
		line = line[:strings.Index(line, "\n")]
		var decoded string
		if err := json.Unmarshal([]byte(line), &decoded); err != nil {
			t.Fatalf("value of %s is not a decodable quoted scalar: %q (%v)", quoted.key, line, err)
		}
		if decoded != quoted.want {
			t.Fatalf("value of %s round-tripped to %q, want %q", quoted.key, decoded, quoted.want)
		}
	}
}

// TestRawJSON proves raw passthrough preserves fields verbatim and only
// re-indents.
func TestRawJSON(t *testing.T) {
	raw := []byte(`{"known":"a","unknownField":{"kept":true}}`)
	var b strings.Builder
	if err := RawJSON(&b, raw); err != nil {
		t.Fatalf("RawJSON: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(b.String()), &decoded); err != nil {
		t.Fatalf("output is not JSON: %v", err)
	}
	if decoded["known"] != "a" {
		t.Fatalf("known field lost: %v", decoded)
	}
	if _, ok := decoded["unknownField"]; !ok {
		t.Fatalf("unknown field dropped: %v", decoded)
	}
}
