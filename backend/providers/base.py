"""MT plug-in interface. User supplies keys; Tuyi does not phone home."""

from __future__ import annotations


class TranslationProviderError(RuntimeError):
    retryable = True


class QuotaExceededError(TranslationProviderError):
    retryable = False


class TranslationProvider:
    name = ""
    needs_key = True

    def translate_text(self, text: str, source_lang: str, target_lang: str) -> str:
        raise NotImplementedError
