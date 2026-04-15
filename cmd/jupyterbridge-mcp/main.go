package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"jupyter-bridge-notebook-project/internal/mcpbridge"
)

func main() {
	cwd := flag.String("cwd", "", "Directory used for bridge auto-discovery")
	baseURL := flag.String("base-url", "", "Explicit bridge base URL override")
	token := flag.String("token", "", "Bearer token")
	timeout := flag.Duration("timeout", 5*time.Second, "HTTP request timeout")
	flag.Parse()

	if err := mcpbridge.RunStdio(context.Background(), mcpbridge.Options{
		CWD:              *cwd,
		PreferredBaseURL: *baseURL,
		Token:            *token,
		Timeout:          *timeout,
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
