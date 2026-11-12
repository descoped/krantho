// Package output renders API data for the terminal.
package output

import (
	"io"
	"strings"
	"text/tabwriter"
)

// tablePadding is the minimum number of spaces between adjacent columns.
const tablePadding = 2

// Table writes a header row and data rows to w as aligned columns. Cells
// must not contain tabs or newlines.
func Table(w io.Writer, header []string, rows [][]string) error {
	tw := tabwriter.NewWriter(w, 0, 0, tablePadding, ' ', 0)
	if _, err := io.WriteString(tw, strings.Join(header, "\t")+"\n"); err != nil {
		return err
	}
	for _, row := range rows {
		if _, err := io.WriteString(tw, strings.Join(row, "\t")+"\n"); err != nil {
			return err
		}
	}
	return tw.Flush()
}
