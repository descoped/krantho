package main

import (
	"os"

	"github.com/descoped/krantho/cli/internal/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
