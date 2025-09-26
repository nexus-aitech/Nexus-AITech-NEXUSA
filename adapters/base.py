class ExchangeAdapter:
    """Base adapter interface for all exchanges."""

    WS_URL: str = ""

    def subscribe(self, symbol: str, tf: str):
        """Return subscription payload for WebSocket."""
        raise NotImplementedError

    def parse_message(self, msg: dict) -> dict:
        """Parse raw exchange message into standard format."""
        raise NotImplementedError
