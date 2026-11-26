# Changelog

## [0.1.3](https://github.com/SudhirDevOps1/drishti-browser-ai/compare/drishti-browser-ai-v0.1.2...drishti-browser-ai-v0.1.3) (2026-11-26)


### 🚀 Features & Capabilities

* **branding:** add Drishti SVG brand suite, R1-R5 visual fixes, and v0.1.2 docs ([7ac5777](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/7ac5777e346546a9044ec367eaf5f1175a089803))
* **bridge:** add zero-dep Python Win32 auto_save.py for Save As dialogs ([7b65a25](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/7b65a25e326b4414e8f0a78be3d236bfc0582503))
* **core:** add bridge reconnect, SQLite workflow cache, silent downloads & zero-clone setup ([ee55104](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/ee551041c2b0fd81bd3c52985a831b5e9b7a081f))
* **downloads:** add zero-click silent downloads, OS Save dialog handler & ISO wait ([e2bbfbd](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/e2bbfbd64156e570db1920bac7216c3c68584485))
* Drishti Browser AI v0.1.0 PRO — Autonomous MCP Browser Platform ([ec1ac8c](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/ec1ac8cd9ccda4c0fc62c2fc3d143bbf3dceb1f5))
* **extension:** add voice commands, custom macros, error drawer, bezier cursor & e2e ci ([4d3b8c1](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/4d3b8c14fe36a2cb1490789856db872ff97613a0))
* **extension:** intercept AI blob downloads in MAIN world with saveAs:false ([8c6adae](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/8c6adae493e3e7220d708afdd86249171b839480))
* **release:** add enterprise pre-release channels (alpha/beta/rc) & Chrome version_name support ([91d2207](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/91d220770523eabf3baed72ac181eac8d5b79489))
* **showcase:** add favicon, extension gallery, hero canvas & MCP explorer ([4e6b1d9](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/4e6b1d9f95859a8d875af3381d1ffb85507c0889))
* **showcase:** add GSAP animated showcase, docs hub and GitHub Pages workflow ([df14462](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/df1446204ae6f93ea35dc8d501980fba6ac00f4d))
* **showcase:** add interactive 4-step install guide & multi-client setup ([9b40e04](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/9b40e04c5049d5cf3d577a7121660ff06a2f00d6))
* **showcase:** add interactive visual gallery, changelog timeline, terminal & GSAP animations ([bda32f6](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/bda32f6878fadabb2b098b4ab9b58695745a670b))
* **sidepanel:** add inline Dispatch Status Banner & clear prompt after Send to AI Agent ([f20e685](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/f20e6852370efd32215d7dca18854cde0a0abdd0))
* two-way Sidepanel to Antigravity & Universal MCP Mission Dispatch ([61b1cb8](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/61b1cb842c8fdc7366a92939a2da29f22464aa84))
* **web-showcase:** add stageshow hero demo, bento grid, and polished navbar ([5d1fe4a](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/5d1fe4ad9f757bcda7c3e95b3b59726fdf93ac39))


### 🐛 Bug Fixes & Stability

* **bridge:** search UIAutomation Descendants for browser Save As dialog ([4c737d4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/4c737d44790c3047a5c22facf89e8d01c48d916f))
* **extension:** prevent download interceptor from hijacking startup and other-extension downloads ([d41d8f4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/d41d8f4220d08d463fb263490d5d4f3ccfdb2007))
* **extension:** prevent duplicate bridge sockets and noisy offline warnings ([60218c4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/60218c4aa2f09706743db0322188f17e08fdacd0))
* **extension:** release v0.1.2 with visual control polish, real CDP hover, and bridge resilience ([2632dc7](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/2632dc776e89f3777705152949283ef508c8c210))
* **extension:** support contenteditable rich-text editors (Slate/ProseMirror) in typeText ([9fba2e4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/9fba2e438ca7421465aa09f6186cd2ee93813bbd))
* **extension:** unify Shadow DOM visual cursor, highlights, scroll-settle, and HUD ([d2c92bf](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/d2c92bf9263c9bcbafc908462911cfd08038d10f))
* **manifest:** move debugger from optional_permissions to permissions ([d33eae1](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/d33eae1fca5d123a413629d9498b56d35beb6dca))
* **setup:** print full 64-char token & require AI to share it with user ([90d7c0f](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/90d7c0f9ebd8bc66166f4b0e702b941226a88cad))


### 🛡️ Security & Privacy

* **deps:** upgrade zod to ^4.6.6 to resolve high-severity memory vulnerability ([e9ad6cb](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/e9ad6cb508f110bf28fb1afbe7fa9d53e89e3931))
* **extension:** remove MV3 eval sink and update ATLAS continuity docs ([51dc68d](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/51dc68d18598c25b6266e44a21766eb67473da11))
* harden WebSocket localhost/origin/DoS, URL protocol allowlist & blocklist enforcement ([a8cddf4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/a8cddf4347b313f5b4009f5f934c55f0333c6bac))


### 📚 Documentation & Guides

* **configs:** update agent configs & universal prompt with v2 rules & SQLite workflow ([2906304](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/2906304d14b8432d38f9738d8f5156a01f0208c6))
* **readme:** document zero-click downloads & browser download security ([8670421](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/86704215ae691890e2efa508ae3dc58d4cb69475))
* **setup:** add 1-prompt AI auto-install & auto-token generation protocol ([d825ec0](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/d825ec0dbb2f489e8bd899b93dc3ceb126a39d92))
* **setup:** add runtime cleanup rule to auto-install prompt ([c4346fe](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/c4346fe920f2867f75c0bf6724d9bee36eba5a94))
* **setup:** support auto-detect, Gemini CLI, Codex, Antigravity & Claude ([fb655f5](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/fb655f5a6847e7ef666c96cc5796d551d2644c6f))
* **setup:** update outdated local installs before running setup:agent ([5f75e60](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/5f75e60656c38f32791ba9954ab9143af03e5e8c))
* update all guides & tool references for v0.1.1 ([e4edf19](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/e4edf19140e66885f9d8cad43d19f77df737680d))


### ⚙️ CI/CD & Release Engineering

* **release:** serialize release-please runs with concurrency group ([8fd0f40](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/8fd0f4032d299b92f8ae68f4acf26728e6233970))
* **release:** sync derived SSOT version surfaces on release-please PRs ([fe46950](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/fe46950681835e89eef6b85fc508c3ae6cfc4edf))


### 🔧 Maintenance & Dependencies

* **deps-dev:** bump vitest from 2.1.9 to 4.1.11 ([#2](https://github.com/SudhirDevOps1/drishti-browser-ai/issues/2)) ([56a08be](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/56a08be978e81770a4075e9c9ccac4bf4123460e))
* **git:** untrack and ignore .agents, .claude, and .opencode ([8e9d184](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/8e9d184e3fe2225822b683155f5f8220490acc39))
* **main:** release drishti-browser-ai 0.1.1 ([c6d59c3](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/c6d59c3100a17f1c0a074ac96b16a23679fe4027))
* **main:** release drishti-browser-ai 0.1.1 ([c6d59c3](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/c6d59c3100a17f1c0a074ac96b16a23679fe4027))
* **main:** release drishti-browser-ai 0.1.1 ([8b09988](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/8b0998862dad09e34696c15a3316f64d79b029a9))
* **release:** add Husky, Commitlint, Release Please & Version SSOT ([164e10c](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/164e10ce782dd22a6ff21d3fc47235888535cd6a))
* **release:** configure enterprise categorized changelog & SHA-256 release notes ([2a3728d](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/2a3728d10ea8b8eed3fe3eb1cc2c02a374943acb))
* **version:** sync all files to v0.1.1 after release-please bump ([1dfd175](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/1dfd175c5950d05f4e00af8e53727dd801f6a18e))
* **version:** sync docs/windows-install.md and docs/PROJECT-STATUS.md in SSOT ([0cf9e25](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/0cf9e25b5ed3d4eb9f1d88dac217968c29756ef9))

## [0.1.2] - 2026-11-26

- 

## [0.1.1](https://github.com/SudhirDevOps1/drishti-browser-ai/compare/drishti-browser-ai-v0.1.0...drishti-browser-ai-v0.1.1) (2026-11-25)


### 🚀 Features & Capabilities

* Drishti Browser AI v0.1.0 PRO — Autonomous MCP Browser Platform ([ec1ac8c](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/ec1ac8cd9ccda4c0fc62c2fc3d143bbf3dceb1f5))
* **extension:** add voice commands, custom macros, error drawer, bezier cursor & e2e ci ([4d3b8c1](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/4d3b8c14fe36a2cb1490789856db872ff97613a0))
* **release:** add enterprise pre-release channels (alpha/beta/rc) & Chrome version_name support ([91d2207](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/91d220770523eabf3baed72ac181eac8d5b79489))
* **showcase:** add GSAP animated showcase, docs hub and GitHub Pages workflow ([df14462](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/df1446204ae6f93ea35dc8d501980fba6ac00f4d))
* **sidepanel:** add inline Dispatch Status Banner & clear prompt after Send to AI Agent ([f20e685](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/f20e6852370efd32215d7dca18854cde0a0abdd0))
* two-way Sidepanel to Antigravity & Universal MCP Mission Dispatch ([61b1cb8](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/61b1cb842c8fdc7366a92939a2da29f22464aa84))


### 🐛 Bug Fixes & Stability

* **extension:** support contenteditable rich-text editors (Slate/ProseMirror) in typeText ([9fba2e4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/9fba2e438ca7421465aa09f6186cd2ee93813bbd))


### 🛡️ Security & Privacy

* **deps:** upgrade zod to ^4.6.6 to resolve high-severity memory vulnerability ([e9ad6cb](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/e9ad6cb508f110bf28fb1afbe7fa9d53e89e3931))
* **extension:** remove MV3 eval sink and update ATLAS continuity docs ([51dc68d](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/51dc68d18598c25b6266e44a21766eb67473da11))
* harden WebSocket localhost/origin/DoS, URL protocol allowlist & blocklist enforcement ([a8cddf4](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/a8cddf4347b313f5b4009f5f934c55f0333c6bac))


### 📚 Documentation & Guides

* **setup:** add 1-prompt AI auto-install & auto-token generation protocol ([d825ec0](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/d825ec0dbb2f489e8bd899b93dc3ceb126a39d92))


### 🔧 Maintenance & Dependencies

* **deps-dev:** bump vitest from 2.1.9 to 4.1.11 ([#2](https://github.com/SudhirDevOps1/drishti-browser-ai/issues/2)) ([56a08be](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/56a08be978e81770a4075e9c9ccac4bf4123460e))
* **release:** add Husky, Commitlint, Release Please & Version SSOT ([164e10c](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/164e10ce782dd22a6ff21d3fc47235888535cd6a))
* **release:** configure enterprise categorized changelog & SHA-256 release notes ([2a3728d](https://github.com/SudhirDevOps1/drishti-browser-ai/commit/2a3728d10ea8b8eed3fe3eb1cc2c02a374943acb))
