Cloudentropy is an independent development derivative of OpenMausBot.

This macOS Apple silicon build uses manual updates from this repository. It does not download or install upstream OpenMausBot releases.

Included development changes:
- Optional DashScope semantic memory retrieval with a local Chinese bigram fallback.
- Model-aware conversation replay and history-based compaction for stateless engines.
- Compatibility fixes for context-length errors and response content formats.
- Independent application identity and guarded manual update controls.

Download the DMG, quit the running app, and replace Cloudentropy in Applications. Compare the download with SHA256SUMS. See cloudentropy-build.json for the source commit and artifact hashes.

The application is ad-hoc signed, not Apple notarized. macOS may require approval in Privacy & Security; a keychain or Accessibility prompt may recur after an identity change. No Apple developer credentials are used.

Existing workspaces remain at ~/.openmausbot. Back up that directory before upgrading. This is not an official OpenMausBot release. LICENSE, NOTICE and the separate enterprise/LICENSE remain applicable.
