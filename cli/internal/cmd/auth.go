package cmd

import (
	"errors"
	"fmt"
	"strings"

	"github.com/descoped/krantho/cli/internal/api"
	"github.com/descoped/krantho/cli/internal/creds"
	"github.com/spf13/cobra"
)

// newAuthCmd groups the authentication commands: login, status, logout.
func newAuthCmd(opts *rootOptions) *cobra.Command {
	auth := &cobra.Command{
		Use:   "auth",
		Short: "Authenticate against the krantho API",
	}
	auth.AddCommand(newAuthLoginCmd(opts), newAuthStatusCmd(opts), newAuthLogoutCmd(opts))
	return auth
}

// openCreds loads the credentials store from the configured path, falling
// back to the production default (~/.krantho/credentials.json).
func openCreds(opts *rootOptions) (*creds.Store, error) {
	path := opts.credsPath
	if path == "" {
		defaultPath, err := creds.DefaultPath()
		if err != nil {
			return nil, err
		}
		path = defaultPath
	}
	store := creds.NewStore(path)
	if err := store.Load(); err != nil {
		return nil, err
	}
	return store, nil
}

// storeEntry persists entry in the credentials store under the resolved
// API origin.
func storeEntry(opts *rootOptions, entry creds.Entry) error {
	store, err := openCreds(opts)
	if err != nil {
		return err
	}
	store.Set(opts.baseURL, entry)
	return store.Save()
}

func newAuthLoginCmd(opts *rootOptions) *cobra.Command {
	var token string
	login := &cobra.Command{
		Use:          "login",
		Short:        "Log in and store credentials for the API origin",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runAuthLogin(cmd, opts, token)
		},
	}
	login.Flags().StringVar(&token, "token", "",
		"shared secret (token mode) or JWT to store (oidc mode)")
	return login
}

// runAuthLogin probes the server's auth mode and dispatches the login flow.
func runAuthLogin(cmd *cobra.Command, opts *rootOptions, token string) error {
	caps, err := api.New(opts.baseURL, "", nil).Capabilities()
	if err != nil {
		return err
	}
	switch caps.Mode {
	case "none":
		fmt.Fprintln(cmd.OutOrStdout(), "Server requires no authentication — nothing stored.")
		return nil
	case "token":
		return loginWithSecret(cmd, opts, token)
	case "oidc":
		return storeProvidedToken(cmd, opts, token)
	default:
		return fmt.Errorf("server reports unsupported auth mode %q", caps.Mode)
	}
}

// loginWithSecret exchanges the shared secret for a token pair and stores
// it under the resolved API origin.
func loginWithSecret(cmd *cobra.Command, opts *rootOptions, secret string) error {
	if secret == "" {
		return errors.New("server uses token auth — pass the shared secret: krantho auth login --token <secret>")
	}
	result, err := api.New(opts.baseURL, "", nil).Login(secret)
	if err != nil {
		return err
	}
	if result.AccessToken == "" {
		return errors.New("login succeeded but the server set no krantho_access cookie")
	}
	entry := creds.Entry{AccessToken: result.AccessToken, RefreshToken: result.RefreshToken}
	if err := storeEntry(opts, entry); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Logged in as %s (mode %s)\n",
		result.Identity.Identity, result.Identity.Mode)
	return nil
}

// storeProvidedToken stores a manually obtained JWT for an oidc-mode server.
func storeProvidedToken(cmd *cobra.Command, opts *rootOptions, token string) error {
	if token == "" {
		return errors.New("server uses oidc auth — obtain a token via Studio, then: krantho auth login --token <jwt>")
	}
	if err := storeEntry(opts, creds.Entry{AccessToken: token}); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Stored provided token for %s (mode oidc)\n", opts.baseURL)
	return nil
}

func newAuthStatusCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "status",
		Short:        "Show the authenticated identity for the API origin",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runAuthStatus(cmd, opts)
		},
	}
}

// runAuthStatus reports who the stored token authenticates as, via
// GET /api/auth/me through the shared session — an expired access token is
// recovered by the session's refresh-once retry. A 401 that survives the
// recovery means the session is gone — the user must log in again.
func runAuthStatus(cmd *cobra.Command, opts *rootOptions) error {
	sess, err := newSession(opts)
	if err != nil {
		return err
	}
	if sess.anonymous() {
		fmt.Fprintln(cmd.OutOrStdout(), "not authenticated (anonymous)")
		return nil
	}
	identity, err := sess.Me()
	if err != nil {
		if isUnauthorized(err) {
			return errSessionExpired
		}
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "authenticated as %s (mode %s, roles %s)\n",
		identity.Identity, identity.Mode, strings.Join(identity.Roles, ", "))
	return nil
}

func newAuthLogoutCmd(opts *rootOptions) *cobra.Command {
	return &cobra.Command{
		Use:          "logout",
		Short:        "Remove stored credentials for the API origin",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runAuthLogout(cmd, opts)
		},
	}
}

// runAuthLogout removes the origin's credentials entry. Idempotent — a
// missing entry is not an error.
func runAuthLogout(cmd *cobra.Command, opts *rootOptions) error {
	store, err := openCreds(opts)
	if err != nil {
		return err
	}
	store.Delete(opts.baseURL)
	if err := store.Save(); err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "Logged out of %s\n", opts.baseURL)
	return nil
}
