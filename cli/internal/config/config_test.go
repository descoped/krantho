package config

import "testing"

func TestConfigResolution(t *testing.T) {
	lookup := func(vars map[string]string) func(string) string {
		return func(key string) string { return vars[key] }
	}

	tests := []struct {
		name string
		flag string
		env  map[string]string
		want string
	}{
		{
			name: "default when flag and env unset",
			want: "http://localhost:3000",
		},
		{
			name: "env overrides default",
			env:  map[string]string{EnvAPIURL: "https://cms.example.com"},
			want: "https://cms.example.com",
		},
		{
			name: "flag overrides env",
			flag: "https://flag.example.com",
			env:  map[string]string{EnvAPIURL: "https://env.example.com"},
			want: "https://flag.example.com",
		},
		{
			name: "flag overrides default",
			flag: "http://localhost:4002",
			want: "http://localhost:4002",
		},
		{
			name: "trailing slash stripped",
			flag: "https://cms.example.com/",
			want: "https://cms.example.com",
		},
		{
			name: "trailing /api stripped",
			flag: "https://cms.example.com/api",
			want: "https://cms.example.com",
		},
		{
			name: "trailing /api/ stripped",
			flag: "https://cms.example.com/api/",
			want: "https://cms.example.com",
		},
		{
			name: "env value normalized too",
			env:  map[string]string{EnvAPIURL: "http://localhost:4002/api/"},
			want: "http://localhost:4002",
		},
		{
			name: "path merely ending in api chars kept",
			flag: "https://cms.example.com/apiary",
			want: "https://cms.example.com/apiary",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveAPIURL(tt.flag, lookup(tt.env))
			if got != tt.want {
				t.Errorf("ResolveAPIURL(%q, env=%v) = %q, want %q", tt.flag, tt.env, got, tt.want)
			}
		})
	}
}
