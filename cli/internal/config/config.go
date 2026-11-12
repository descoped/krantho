// Package config resolves krantho CLI configuration from flags and environment.
package config

import "strings"

const (
	// EnvAPIURL names the environment variable consulted when --api-url is not set.
	EnvAPIURL = "KRANTHO_API_URL"

	// DefaultAPIURL is the API base URL when neither the flag nor the environment
	// variable is set.
	DefaultAPIURL = "http://localhost:3000"
)

// ResolveAPIURL resolves the API base URL with precedence --api-url flag >
// KRANTHO_API_URL environment > DefaultAPIURL, then normalizes the result:
// a trailing "/" is stripped, and a trailing "/api" is stripped — the /api
// prefix belongs to request paths, not the base URL. The env lookup is
// injected so resolution stays testable without mutating the process
// environment.
func ResolveAPIURL(flagValue string, getenv func(string) string) string {
	base := flagValue
	if base == "" {
		base = getenv(EnvAPIURL)
	}
	if base == "" {
		base = DefaultAPIURL
	}
	base = strings.TrimSuffix(base, "/")
	return strings.TrimSuffix(base, "/api")
}
