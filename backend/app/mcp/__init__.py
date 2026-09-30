"""Hosted MCP server for int.ai — exposes hiring operations to MCP clients.

Mounted on the FastAPI app at ``/mcp`` (see ``app.main``). Authenticated with
long-lived API keys issued from Settings → API Keys (``app.api.api_keys``).
"""
