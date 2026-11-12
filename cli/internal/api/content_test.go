package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListContentReadsHasMore(t *testing.T) {
	tests := []struct {
		name string
		body string
		want bool
	}{
		{name: "another page follows", body: `{"items":[],"hasMore":true}`, want: true},
		{name: "last page", body: `{"items":[],"hasMore":false}`, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, tt.body)
			}))
			defer srv.Close()

			list, err := New(srv.URL, "", nil).ListContent("pages", ListContentOptions{})
			if err != nil {
				t.Fatalf("ListContent failed: %v", err)
			}
			if list.HasMore != tt.want {
				t.Errorf("HasMore = %v, want %v", list.HasMore, tt.want)
			}
		})
	}
}
