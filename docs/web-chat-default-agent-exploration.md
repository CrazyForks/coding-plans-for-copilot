# Web Chat Default Agent Exploration

## Status

Failed exploration. No runtime change from this investigation is retained.

## Problem

In `vscode.dev`, sending a request with a configured Coding Plans language model emitted the following Window output warning and did not send an upstream request:

```text
sendRequest No default agent for location panel
```

## Findings

- The warning is emitted by VS Code's internal ChatService while it resolves the Chat Agent for the `panel` location. It occurs before `LanguageModelChatProvider.provideLanguageModelChatResponse()` and before the extension can call the configured upstream endpoint.
- `LanguageModelChatProvider` contributes models. It does not register a Chat Agent and cannot become the default Chat Agent.
- The public `vscode.chat.createChatParticipant()` API only adds an explicitly selected `@participant`. It does not expose a `default`, `location`, or `isDefaultForLocation` option.
- The internal `isDefaultForLocation.panel` metadata is not part of the stable extension API. Using private or proposed APIs to set it would make the extension incompatible with normal VS Code and VS Code for the Web hosts.

## Attempts Reverted

1. Disabled dynamic `workbench.action.*` language-model refresh commands in the browser extension host.
   - The warning and inability to send requests remained.
2. Added a public `@coding-plans` Chat Participant that forwarded the request to the selected Coding Plans model.
   - The affected Web host still could not send a request, so the participant did not provide a usable workaround.

Both changes and their tests were reverted.

## Conclusion

The affected `vscode.dev` host needs to supply a Chat Agent that is valid for the `panel` location. This is a VS Code/Copilot Chat host prerequisite, not a provider-registration capability that an extension can add through the public API.

Further investigation should use a minimal reproduction with the VS Code Web build identifier, browser console output, GitHub authentication/Copilot state, and the exact steps to open the Chat panel. Report that reproduction to the VS Code or GitHub Copilot Chat issue tracker if the host has no usable default panel agent.