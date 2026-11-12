package output

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

// MarkdownDocument writes a content document as a readable markdown file:
// a YAML frontmatter block (`---` fences, one `key: value` line per field,
// keys sorted for determinism) followed by a blank line and the body. Every
// emitted value is valid YAML, so the output round-trips as a document.
func MarkdownDocument(w io.Writer, fields map[string]any, body string) error {
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteString("---\n")
	for _, key := range keys {
		value, err := frontmatterValue(fields[key])
		if err != nil {
			return fmt.Errorf("render field %q: %w", key, err)
		}
		b.WriteString(key)
		b.WriteString(": ")
		b.WriteString(value)
		b.WriteString("\n")
	}
	b.WriteString("---\n\n")
	b.WriteString(body)
	if !strings.HasSuffix(body, "\n") {
		b.WriteString("\n")
	}
	_, err := io.WriteString(w, b.String())
	return err
}

// RawJSON writes a raw JSON value exactly as the server sent it —
// indentation only, never reshaped through typed structs, so no field the
// server returns is ever dropped.
func RawJSON(w io.Writer, raw []byte) error {
	var buf bytes.Buffer
	if err := json.Indent(&buf, raw, "", "  "); err != nil {
		return err
	}
	buf.WriteByte('\n')
	_, err := w.Write(buf.Bytes())
	return err
}

// frontmatterValue renders a field value for a frontmatter line. Strings
// that read back as the same YAML string stay verbatim; anything else —
// strings with special characters or newlines, and all non-string values —
// is JSON-encoded, which is valid YAML (double-quoted scalars with escapes,
// flow collections).
func frontmatterValue(value any) (string, error) {
	if s, ok := value.(string); ok && plainYAMLScalar(s) {
		return s, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// plainScalarPattern is deliberately conservative: a leading letter keeps
// numbers, punctuation-led strings, and YAML indicators out; the character
// set excludes `:`, `#`, quotes, and every flow/anchor indicator.
var plainScalarPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9 ._/()-]*$`)

// plainYAMLScalar reports whether s can appear unquoted after `key: ` and
// still parse as exactly the same YAML string.
func plainYAMLScalar(s string) bool {
	if !plainScalarPattern.MatchString(s) || strings.HasSuffix(s, " ") {
		return false
	}
	switch strings.ToLower(s) {
	case "true", "false", "null", "yes", "no", "on", "off":
		return false
	}
	return true
}
