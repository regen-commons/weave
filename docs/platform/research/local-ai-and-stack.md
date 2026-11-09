# Technical stack research: local-first AI intake app (regenerative initiatives)

Research date: 2026-10-31. Scope: in-browser LLM/STT/document extraction, consented cloud fallback, Supabase (Auth OTP via Resend, pgvector, PostGIS, scheduling), Resend, Vercel, matching references. Claims cite a URL; statements marked **[inference]** are my reading, not a source statement. Prices are list prices on the cited date.

---

## A. In-browser LLM inference (state of the art, Oct 2026)

### A.1 Transformers.js v4 (`@huggingface/transformers`) — the incumbent in this codebase

- **Current version:** 4.3.2 (`latest` on npm; GitHub release dated 28 Oct 2026; a `4.4.0-next.0` pre-release appeared 30 Oct 2026). License Apache-2.0. Release train: 4.0.0 (30 Mar 2026) → 4.1.0/4.2.0 (23 Apr 2026) → 4.3.0 (16 Sep 2026) → 4.3.1 (7 Oct 2026) → 4.3.2. Sources: [GitHub releases](https://github.com/huggingface/transformers.js/releases), [npm registry record for the structured-output companion](https://registry.npmjs.org/@huggingface/transformers-structured-output).
- **What v4 changed (HF blog, 9 Feb 2026 preview):** WebGPU runtime "completely rewritten in C++" with the ONNX Runtime team; ~4x speed-up on BERT-style embedding models (MultiHeadAttention contrib op); GPT-OSS 20B q4f16 at ~60 tok/s on an M4 Pro Max (self-reported); default bundle 53% smaller; models >8B now supported; `ModelRegistry` (`get_pipeline_files`, `get_file_metadata`, `is_pipeline_cached`, `clear_pipeline_cache`, `get_available_dtypes`) so you can compute download size and cache state before loading; `env.useWasmCache` caches the ORT WASM runtime for offline use; same code runs in browsers, Node, Bun, Deno. Source: [huggingface.co/blog/transformersjs-v4](https://huggingface.co/blog/transformersjs-v4).
- **Backends:** WebGPU (primary accelerated path) and WASM (CPU). 4.3.0 explicitly "enabled WebGPU on Safari 26+" and upgraded ONNX Runtime; 4.3.2 exposes `env.backends.onnx.getSupportedDevices()` for runtime capability probing. Source: [GitHub releases](https://github.com/huggingface/transformers.js/releases).
- **Structured output:** 4.2.0 added tool calling (`tools` input to `TextGenerationPipeline`). 4.3.0 added the experimental `@huggingface/transformers-structured-output` package (4.3.2, 27 Oct 2026, Apache-2.0, "Dependency-free constrained generation for Transformers.js"; peer dep `@huggingface/transformers ^4.3.2`) that constrains decoding to a JSON Schema, a generic JSON object, or a regex. Documented limits: one sequence at a time; `max_new_tokens` must leave room for the output to finish. Sources: [releases](https://github.com/huggingface/transformers.js/releases), [npm record](https://registry.npmjs.org/@huggingface/transformers-structured-output).
- **Caching:** model files and WASM are stored via the browser **Cache API** (not OPFS); entries are keyed per origin so the same model is re-downloaded by each site. HF/Chrome's 23 Jun 2026 post describes the experimental `env.experimental_useCrossOriginStorage = true` path (PR #1549) that keys files by SHA-256 through the WICG Cross-Origin Storage proposal; no browser ships it natively yet (Chrome extension polyfill only). 4.3.0 also fixed repeat downloads when a progress callback is used. Sources: [huggingface.co/blog/cross-origin-storage](https://huggingface.co/blog/cross-origin-storage), [releases](https://github.com/huggingface/transformers.js/releases).
- **Small instruct models with ONNX exports (measured file sizes from the HF API, decimal MB):**

| Model (repo) | q4f16 | q4 | int8/uint8 | fp16 | Notes |
|---|---|---|---|---|---|
| Qwen3-0.6B ([onnx-community/Qwen3-0.6B-ONNX](https://huggingface.co/api/models/onnx-community/Qwen3-0.6B-ONNX/tree/main/onnx)) | 570 MB | 919 MB | 618 MB | 1,203 MB | Apache-2.0 upstream; most practical phone-class candidate **[inference]** |
| Qwen3-1.7B ([onnx-community/Qwen3-1.7B-ONNX](https://huggingface.co/api/models/onnx-community/Qwen3-1.7B-ONNX/tree/main/onnx)) | 1,426 MB | 2,147 MB | 1,742 MB | 3,452 MB | Desktop/laptop WebGPU tier |
| Gemma 4 E2B ([onnx-community/gemma-4-E2B-it-ONNX](https://huggingface.co/api/models/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx)) | decoder 1,520 MB + embed_tokens 1,591 MB (+ vision 99 MB, audio 171 MB) | decoder 1,864 + embed 1,763 MB | "quantized" decoder ~3,039 MB | decoder 4,761 MB | ≈3.1 GB text-only at q4f16; multimodal (image+audio) in one model; released 31 Mar 2026 per [Google's Gemma release log](https://ai.google.dev/gemma/docs/releases) (announced 2 Apr 2026), Gemma terms of use |
| Gemma 3 1B ([onnx-community/gemma-3-1b-it-ONNX](https://huggingface.co/api/models/onnx-community/gemma-3-1b-it-ONNX/tree/main/onnx)) | 764 MB | 859 MB | 1,001 MB | 2,034 MB | Gemma terms; a third-party benchmark reported a WebGPU load abort on an older Transformers.js, so re-test on 4.3.x |
| Gemma 3n E2B ([onnx-community/gemma-3n-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX)) | — | — | — | — | Node-only at v3.6 "due to size"; 4.3.0 fixed its WebGPU KV cache, implying browser WebGPU now works **[inference]** |
| SmolLM3-3B ([HuggingFaceTB/SmolLM3-3B-ONNX](https://huggingface.co/api/models/HuggingFaceTB/SmolLM3-3B-ONNX/tree/main/onnx)) | 2,124 MB | 2,843 MB | 3,109 MB | 6,167 MB | Supported since 3.6.2; card has a WebGPU q4f16 example; Apache-2.0; laptop-tier only |
| Phi-4-mini ([onnx-community/Phi-4-mini-instruct-ONNX-MHA](https://huggingface.co/onnx-community/Phi-4-mini-instruct-ONNX-MHA)) | — | — | — | — | MIT model; issue [#1460](https://github.com/huggingface/transformers.js/issues/1460) reported WebGPU external-data load failure (~Nov 2025); no confirmed in-browser demo found |
| LFM2-1.2B ([onnx-community/LFM2-1.2B-ONNX](https://huggingface.co/api/models/onnx-community/LFM2-1.2B-ONNX/tree/main/onnx)); LFM2.5-1.2B-Instruct-ONNX; LFM3 (4.3.2) | 760 MB | 850 MB | 1,208 MB (q8) | 2,357 MB | Liquid docs name Transformers.js+WebGPU as a supported route, recommend Q4 ([docs.liquid.ai](https://docs.liquid.ai/docs/inference/onnx)); LFM Open License |

Gemma 3n E2B and Phi-4-mini were not size-measured here (read their `onnx/` listings before committing). Rule of thumb from the measured rows: q4f16 ≈ 0.6–0.95 GB per billion parameters for dense models; Gemma's 262k-token vocabulary makes its embedding table as large as its decoder **[inference from the listing]**. Peak RAM/VRAM is weights + KV cache + runtime; budget roughly 1.5x the weight size for short (≤2k-token) prompts **[inference]**.

### A.2 WebLLM (MLC)

- **Status:** active again after a ~9-month quiet period. Releases: v0.2.81 (18 Feb 2026: Engine/`MLCEngine` API, OpenAI-style chat with function calls, Qwen2/2.5/3, XGrammar JSON-schema constraints), v0.2.82 (13 Mar), v0.2.83 (24 Apr: cross-origin storage, integrity checks, subgroups), v0.2.85 (8 Sep: OPFS sync access), v0.2.86 (11 Oct: Gemma 4 E2B text+audio, 224 rebuilt WebGPU libraries), **v0.2.87 (30 Oct 2026)**: faster Gemma 4 prefill, Qwen3.5 JSON-schema fix, Gemma 3 context fix. npm `@mlc-ai/web-llm` 0.2.87, Apache-2.0. Sources: [GitHub releases](https://github.com/mlc-ai/web-llm/releases), [npm registry](https://registry.npmjs.org/@mlc-ai/web-llm/latest).
- **Backend:** WebGPU only ("accelerated with WebGPU"; no WASM fallback). Caching via `AppConfig.cacheBackend`: `"cache"` (Cache API, default), `"indexeddb"`, `"opfs"`, experimental `"cross-origin"` (needs Chrome extension, falls back automatically). Web Worker and Service Worker engines (SW "can be killed any time"; heartbeat mitigation). Source: [README](https://raw.githubusercontent.com/mlc-ai/web-llm/main/README.md).
- **Structured output:** JSON mode plus XGrammar-based JSON-schema/grammar constraints and "structural tags" for tool calls, implemented in the model library's WASM for speed. Sources: [README](https://raw.githubusercontent.com/mlc-ai/web-llm/main/README.md), [releases](https://github.com/mlc-ai/web-llm/releases).
- **Mobile reality:** a 2024 WebKit bug shows chat.webllm.ai requesting a 1 GB buffer on iPhone; WebLLM cut it to 256 MB after iOS killed the tab at ~1 GB ([bugs.webkit.org 275958](https://bugs.webkit.org/show_bug.cgi?id=275958)). A 2026 field test on an iPhone 11 Pro Max (WebGPU `maxBufferSize` ≈ 716 MB) found none of WebLLM 0.2.84, Transformers.js or wllama finished generation: Qwen2.5-1.5B downloaded 728 MB then errored; Llama-3.2-1B generated a few tokens then the page reloaded ([write-up via HN](https://hackernews-dynamic.seasondane.workers.dev/news/48624985)). Treat WebLLM as desktop/laptop-only in the tiering **[inference]**.

### A.3 Chrome built-in AI: Prompt API + Gemini Nano

- **Availability:** "available in Chrome as of version 148 (Desktop)" (May 2026), Windows/macOS/Linux/Chromebook Plus; Android and iOS not supported; MDN classes it "Limited availability", not Baseline; Mozilla and WebKit standards positions are **Negative**. The sampling-parameters extension is in an origin trial (Chrome 148, per Chrome docs updated 19 May 2026). Sources: [GoogleChrome/modern-web-guidance language-model.md](https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/guides/built-in-ai/language-model.md), [MDN Prompt API](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API), [developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api), [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/languagemodel/).
- **Device requirements (Chrome docs):** 22 GB free on the profile volume, GPU with >4 GB VRAM **or** CPU with 16 GB RAM and ≥4 cores; audio input requires the GPU path; unmetered connection; the Gemini Nano download is shared by all origins. Developer must accept Google's Generative AI Prohibited Uses Policy. Sources: [Chrome docs](https://developer.chrome.com/docs/ai/prompt-api), [Google guidance file](https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/guides/built-in-ai/language-model.md).
- **API shape:** `LanguageModel.availability()` → `unavailable | downloadable | downloading | available`; `LanguageModel.create({ initialPrompts, expectedInputs:[{type:"image"},{type:"audio"}], monitor })` (needs transient user activation); `session.prompt()/promptStreaming()`; `responseConstraint` accepts a **JSON Schema or RegExp** and throws `NotSupportedError` for unsupported schema features; `measureContextUsage()`; gated by the `language-model` Permissions-Policy. Sources: [webmachinelearning/prompt-api README](https://github.com/webmachinelearning/prompt-api), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API).
- **Edge:** same `LanguageModel` surface as a developer preview in Canary/Dev only (from 138.0.3309.2), default model Phi-4-mini (GPU ≥5.5 GB VRAM, 20 GB free, Windows 10/11 or macOS 13.3+), and from 150.0.4070 the smaller prerelease Aion-1.0-Instruct for "Medium/Low" devices via CPU inference; `responseConstraint` JSON schema/regex supported. Page updated 19 Oct 2026. Source: [learn.microsoft.com Prompt API](https://learn.microsoft.com/microsoft-edge/web-platform/prompt-api).

### A.4 Google LiteRT-LM Web API

- `@litert-lm/core` 0.19.0 (30 Oct 2026; first publish 18 May 2026), Apache-2.0; the JS API is an "early preview", **text in/out only**, WebGPU backend; loads models from HF's "Web LLM Models" collection (Gemma 4 E2B, E4B, 12B, 26B A4B, 31B; gated → needs a user HF token). Core 0.19.0 adds "Accelerated Logit Masking" for constrained decoding and function calling; speech models (Qwen3-ASR, Kokoro, Qwen3-TTS) landed in the core, not documented for web. Sources: [npm registry](https://registry.npmjs.org/@litert-lm/core), [google-ai-edge/LiteRT-LM README](https://github.com/google-ai-edge/LiteRT-LM), [ai.google.dev/edge/litert-lm/js](https://ai.google.dev/edge/litert-lm/js).

### A.5 Apple and Firefox

- **Apple:** Foundation Models is a Swift framework (`LanguageModelSession`, ~3B on-device model; WWDC 2026 added image input and third-party model routing). No web-exposed API exists, and WebKit's position on the Prompt API is negative. Sources: [Apple FoundationModels docs](https://developer.apple.com/documentation/updates/foundationmodels.md), [MacRumors WWDC26](https://www.macrumors.com/2026/06/09/apple-outlines-major-ai-and-developer-tool-updates/), [MDN Prompt API positions](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API).
- **Firefox:** no built-in prompt API (negative position). WebGPU: Windows in 141 (22 Jul 2025), Apple-silicon macOS in 145 then all macOS in 147 (13 Jan 2026); Linux and Android still pre-release only as of Aug 2026. Sources: [Wikipedia WebGPU](https://en.wikipedia.org/wiki/WebGPU), [Firefox 147 notes](https://www.firefox.com/ia/firefox/notes), [Mozilla 141 announcement via Simon Willison](https://simonwillison.net/2025/Jul/16/webgpu-firefox).

### A.6 WebGPU availability and mobile Safari memory

- **Shipped:** Chrome 113 (May 2023, Windows/macOS/ChromeOS), Chrome Android 121, Chrome Linux 144/147, Chrome 146 "compatibility mode" (OpenGL ES 3.1, Android first, Feb 2026); Edge 113; **Safari 26 on macOS Tahoe, iOS 26, iPadOS 26, visionOS 26 (15 Sep 2025), on by default** — iPhone 11 is the oldest iOS 26 device; W3C Candidate Recommendation Draft (Sep 2026). Sources: [Wikipedia WebGPU](https://en.wikipedia.org/wiki/WebGPU), [WebKit bug thread citing the Safari 26.0 features post](https://bugs.webkit.org/show_bug.cgi?id=299237), [web.dev browser-support post](https://web.dev/blog/webgpu-supported-major-browsers), [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).
- **Mobile Safari memory limits (practical):** WebKit bugs document "Only ~300 MB of RAM is reliably available to WebAssembly pages" ([269777](https://bugs.webkit.org/show_bug.cgi?id=269777)), an 8 GB iPad offering 1.88 GB to a page via `Uint8Array` ([268816](https://bugs.webkit.org/show_bug.cgi?id=268816)), and the Gigacage fragmentation mega-bug ([269937](https://bugs.webkit.org/show_bug.cgi?id=269937)), resolved by enlarging the Gigacage and enabling wasm fast-memory on iOS (bugs 272171/272232; no shipping version stated). iOS kills the tab on memory pressure rather than failing an allocation (no warning event). WebGPU adapters on 2019-class iPhones advertise `maxBufferSize` ≈ 716 MB. **Planning numbers [inference]:** budget ≤ ~600 MB of model weights and ≤ ~1 GB total page memory on iPhone; expect silent tab reloads above that.

### A.7 Device signals

- `navigator.deviceMemory`: Chromium-only (Chrome, Edge, Chrome Android, Samsung Internet), HTTPS-only, coarsened to a power of two and clamped (the Device Memory spec clamps to 0.25–8 GiB **[known spec behaviour, verify]**); unsupported in Safari and Firefox, so it cannot size iPhones. Source: [MDN deviceMemory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory).
- WebGPU `adapter.limits.maxBufferSize` / `maxStorageBufferBindingSize` and `navigator.storage.estimate()` are available everywhere WebGPU is, and are the better capacity signals on Apple devices **[inference]**. `navigator.hardwareConcurrency` is widely available but capped/fuzzed.

### A.8 Model caching: Cache API vs OPFS vs IndexedDB

- All three share one per-origin quota. Chrome/Edge: up to 60% of disk per origin, 80% browser-wide. Firefox: best-effort min(10% disk, 10 GiB group limit), persistent up to 50%/8 TiB. Safari (macOS 14/iOS 17+): ~60% of disk per origin in browser apps, ~15% in WKWebView, cross-origin iframes 1/10 of parent; older Safari started at 1 GiB then prompted. Eviction is LRU under storage pressure, all-or-nothing per origin; `navigator.storage.persist()` exempts an origin (Safari/Chromium decide silently from engagement). Writes over quota throw `QuotaExceededError`. Source: [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- **Safari ITP 7-day rule:** script-writable storage (IndexedDB, Cache, localStorage, service worker) of an origin without a user tap/click in the last 7 days of Safari use is deleted; home-screen web apps are reported to be exempt. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Didomi summary of WebKit's announcement](https://docs.didomi.io/releases-and-announcements/announcements/apple-implements-7-day-cap-on-script-writable-storage), [iOS Safari limitations table](https://swoff.netlify.app/docs/concepts/ios-safari-limitations).
- **Choice:** Cache API is what Transformers.js and WebLLM use by default and is the Chrome team's recommendation for model files; OPFS exposes file sizes cheaply and supports sync access in workers (WebLLM 0.2.85 added it; `@p0u4a/opfs-cache` is a Cache-compatible OPFS shim); IndexedDB is slowest for multi-hundred-MB blobs **[inference, consistent with the Lumafield write-up]**. Sources: [Lumafield OPFS post](https://barndoors.lumafield.com/3x-faster-project-loads-with-the-origin-private-file-system/), [opfs-cache](https://github.com/P0u4a/opfs-cache), [HF cross-origin-storage post](https://huggingface.co/blog/cross-origin-storage).

### A.9 Recommended tiering (concrete)

All thresholds are design recommendations **[inference]** built on the sources above; tune with telemetry.

| Tier | Detection | Engine / model | Expected footprint |
|---|---|---|---|
| T0 Browser-provided model | `typeof LanguageModel !== "undefined"` and `await LanguageModel.availability() !== "unavailable"` (Chrome 148+ desktop; Edge Canary/Dev) | Prompt API with `responseConstraint` = your Zod-derived JSON Schema | 0 MB app download; model shared across sites |
| T1 Desktop WebGPU | `navigator.gpu` + adapter OK, `adapter.limits.maxBufferSize ≥ 2 GiB`, `(navigator.deviceMemory ?? 8) ≥ 8`, `storage.estimate().quota − usage ≥ 3 GB`, not a touch-only UA | Transformers.js `device:"webgpu"`, `dtype:"q4f16"`: Qwen3-1.7B (1.43 GB) or SmolLM3-3B; Gemma 4 E2B (≈3.1 GB) only on ≥16 GB machines; WebLLM optional alternative | 1.4–3.1 GB cached once |
| T2 Mobile/low-RAM WebGPU | WebGPU present but `maxBufferSize < 2 GiB` or `deviceMemory ≤ 4` or iOS/iPadOS 26 | Transformers.js Qwen3-0.6B q4f16 (570 MB) with max 1–2k token context; keep total ≤ ~600 MB weights; hard stop above ~1 GB page memory | 570 MB |
| T3 WASM only | no WebGPU (Firefox Android, older Safari, Linux Firefox) | Transformers.js WASM: embeddings/reranking stay local (existing ~700-funder ranking); LLM structuring goes to T4 after consent, or offer the "download 570 MB and wait" option for patient users | — |
| T4 Consented cloud | user opts in per session (or per field) with visible provider name and retention statement | see §D | — |

Operational rules: probe `ModelRegistry.get_file_metadata` to show the exact download size before fetching; request `navigator.storage.persist()` and encourage "Add to Home Screen" on iOS to escape the 7-day purge; run inference in a Worker and watch for `device.lost`; keep the funder-ranking embeddings path (already shipping) independent of the LLM tier.

---

## B. In-browser speech-to-text

- **Whisper via Transformers.js (ONNX, onnx-community):** whisper-large-v3-turbo encoder fp16 1,274 MB / q4f16 370 MB / int8 645 MB, merged decoder q4f16 194 MB / fp16 344 MB / int8 440 MB (so a WebGPU fp16-encoder + q4f16-decoder build is ≈1.47 GB; an all-q4f16 build ≈ 564 MB). whisper-base: encoder fp16 41 MB / int8 23 MB, merged decoder fp16 105 MB / int8 54 MB (≈150 MB fp16, ≈77 MB int8). Multilingual (99 languages) except the `.en` variants. Reported throughput is anecdotal (≈10x real-time on an M3 Max, Oct 2024 Reddit). 4.3.0 fixed Whisper progress callbacks. Sources: [HF API whisper-large-v3-turbo](https://huggingface.co/api/models/onnx-community/whisper-large-v3-turbo/tree/main/onnx), [HF API whisper-base](https://huggingface.co/api/models/onnx-community/whisper-base/tree/main/onnx), [r/LocalLLaMA thread](https://redlib.hackliberty.org/r/LocalLLaMA/comments/1ftlznt/openais_new_whisper_turbo_model_running_100), [a community WebGPU repack with a WebGPU-garbling caveat](https://huggingface.co/striimit/whisper-large-v3-turbo-webgpu).
- **Moonshine (Useful Sensors / moonshine-ai):** streaming-friendly encoder-decoder ASR; `onnx-community/moonshine-base-ONNX` powers the `webml-community/moonshine-web` demo (WebGPU with WASM fallback); the upstream README points browser users to its own MoonshineJS library; English-first (a third-party 62M German export exists and notes a cache-branch `If` bug requiring a custom decode loop in v4); 4.3.0 fixed Moonshine token decoding. Sources: [moonshine-web Space](https://huggingface.co/spaces/webml-community/moonshine-web/raw/main/README.md), [usefulsensors/moonshine](https://github.com/usefulsensors/moonshine), [German export](https://huggingface.co/Phreak87/moonshine-base-de-onnx).
- **Parakeet (NVIDIA):** Transformers.js 3.7.6 (20 Oct 2025) added Parakeet **CTC**; CTC checkpoints are English-only, while TDT 0.6B v3 covers 25 European languages (CC-BY-4.0) and runs in-browser through `parakeet.js` / a Transformers.js-v4 TDT demo, with the decoder falling back to WASM because of ORT WebGPU op gaps. Sources: [transformers.js releases](https://github.com/huggingface/transformers.js/releases), [parakeet.js](https://www.pkgstats.com/pkg:parakeet.js), [tdt-webgpu-demo](https://gh.r-mj.com/ysdede/tdt-webgpu-demo), [parakeet-rs docs](https://docs.rs/crate/parakeet-rs/0.2.1).
- **Web Speech API (`SpeechRecognition`):** Chrome added on-device recognition with `processLocally`, `SpeechRecognition.available({langs, quality, processLocally})` → `available | downloadable | downloading | unavailable`, and `install()` (Chrome 139 per the chrome-ai-dev-preview thread; MDN marks both experimental, gated by the `on-device-speech-recognition` Permissions-Policy). With `processLocally:false` (the default) Chrome historically streams audio to Google's servers. Safari exposes `webkitSpeechRecognition` (since 14.1) backed by Apple's speech service; whether it is processed on-device is not documented, continuous mode on iOS is unreliable (dropped words, mic staying open), and the newer on-device SpeechAnalyzer framework is not exposed to the web. Sources: [MDN available()](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static), [MDN install()](https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static), [chrome-ai-dev-preview thread](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/Rlyc2uAsFCY), [Edge Speech Recognition docs](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api), [addpipe on SpeechAnalyzer](https://blog.addpipe.com/apple-speechanalyzer-api/), [Apple forum thread](https://discussions.apple.com/thread/255492924).
- **Capture:** Safari supports MediaRecorder since macOS 14.1/iOS 14.5 but only `audio/mp4` (AAC) until 18.3; WebM/Ogg (Opus) from Safari 18.4; Chrome records `audio/webm;codecs=opus`. Recording needs HTTPS and a user gesture on iOS. For Whisper/Moonshine you need 16 kHz mono Float32 PCM anyway, so capture with `AudioWorklet` (or `createMediaStreamSource` + resample) and skip container formats; keep a MediaRecorder blob only if you also upload audio for the cloud tier. Sources: [testmuai MediaRecorder support table](https://www.testmuai.com/web-technologies/mediarecorder/), [WebKit MediaRecorder post](https://webkit.org/blog/11353/mediarecorder-api/), [MDN isTypeSupported via w3cub mirror](https://docs.w3cub.com/dom/mediarecorder/istypesupported_static).
- **Recommendation [inference]:** default to Whisper via Transformers.js — `whisper-base` (≈77–150 MB) on T2 devices and `whisper-large-v3-turbo` q4f16 (≈0.56 GB) or fp16-encoder (≈1.47 GB) on T1 — because it is multilingual, runs in the same ORT runtime already loaded for embeddings, and keeps audio on-device. Offer Web Speech API as an optional "fast dictation" path only on Chrome with `processLocally:true` succeeding; never enable it on Safari without telling users audio may leave the device. Reserve Moonshine for English live-caption UX and Parakeet-TDT for European-language batch transcription once ORT WebGPU covers its decoder.

---

## C. In-browser document extraction and structured output

### C.1 Parsers (versions as of 31 Oct 2026, from the npm registry)

| Format | Library | Version / license | Notes |
|---|---|---|---|
| PDF (text layer) | `pdfjs-dist` (pdf.js) | 6.4.299, Apache-2.0, published ≈3 Oct 2026; ESM entry `build/pdf.mjs`; Node builds need Node ≥22.13 | `getDocument()` → `page.getTextContent()` per page; set `GlobalWorkerOptions.workerSrc`; pdf.js does **not** OCR. Detect scanned PDFs when `getTextContent()` returns (near-)empty items, then render the page to a canvas and OCR it **[inference]**. Source: [npm pdfjs-dist](https://registry.npmjs.org/pdfjs-dist/latest) |
| DOCX | `mammoth` | 1.13.0, BSD-2-Clause; browser bundle `mammoth.browser.min.js` | `extractRawText({arrayBuffer})` or `convertToHtml`; .docx only (no legacy .doc); images are dropped from raw text. Source: [npm mammoth](https://registry.npmjs.org/mammoth/latest) |
| XLSX/CSV | SheetJS CE | **npm `xlsx` is frozen at 0.18.5 (Mar 2022, "known registry bug")**; current CE is 0.20.3 installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; license Apache-2.0 (npm metadata) | `XLSX.read(arrayBuffer)` → `utils.sheet_to_json`. Pin the tarball URL in `package.json`; the Pro edition is commercial. Sources: [SheetJS install docs](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [npm xlsx](https://registry.npmjs.org/xlsx/latest) |
| Images / scanned pages (OCR) | `tesseract.js` | 7.0.0, Apache-2.0 | WASM (SIMD detected via `wasm-feature-detect`), Web Worker based; language `traineddata` downloaded on first use; **no WebGPU path** (CPU only) **[inference: not mentioned anywhere in the package]**. Slow on phones for multi-page scans; cap pages or offer cloud OCR. Source: [npm tesseract.js](https://registry.npmjs.org/tesseract.js/latest) |
| PPTX | `pptxtojson` 2.2.0 (browser-first text + speaker notes → JSON) or `pptx-browser` 4.1.5 (zero-dependency, Chrome 80+/Firefox 113+/Safari 16.4+) | — | Or unzip with `fflate`/JSZip and read `<a:t>` runs from `ppt/slides/slide*.xml` plus `ppt/notesSlides/*` (OOXML) **[known format, inference]**. Sources: [pptxtojson README](https://cdn.jsdelivr.net/npm/pptxtojson@2.2.0/README.md), [pptx-browser](https://www.pkgstats.com/pkg:pptx-browser) |

### C.2 Image understanding for project photos (Transformers.js ONNX, HF API sizes)

- **SmolVLM-256M-Instruct** ([onnx](https://huggingface.co/api/models/HuggingFaceTB/SmolVLM-256M-Instruct/tree/main/onnx)): q4f16 ≈ 77 (decoder) + 57 (embed) + 55 (vision) ≈ **189 MB**; fp16 ≈ 514 MB. Apache-2.0; SmolVLM was re-enabled in Transformers.js 4.1.0. Good for "describe this photo / what land-use is visible" prompts on T1 and T2 **[inference]**.
- **Florence-2-base-ft** ([onnx](https://huggingface.co/api/models/onnx-community/Florence-2-base-ft/tree/main/onnx)): q4f16 ≈ 62 (vision) + 79 (embed) + 26 (encoder) + 57 (decoder) ≈ **224 MB**; fp16 ≈ 544 MB. Task-prompt model (`<CAPTION>`, `<MORE_DETAILED_CAPTION>`, `<OCR>`, `<OD>`), so it doubles as a light OCR for photographed signs/handouts; MIT upstream.
- **Moondream2:** only the 2024 `Xenova/moondream2` experimental export (v3-era, build-from-source) and a text-only `onnx-community/moondream2.text_model-ONNX`; not a maintained browser path. Source: [Xenova/moondream2](https://huggingface.co/Xenova/moondream2).
- **Gemma 4 E2B** accepts images and audio natively but costs ≈3.4 GB at q4f16 (§A.1); only sensible on T1.

### C.3 Structured extraction patterns with small models

1. **One schema, several enforcers.** Author the target as Zod (4.6.7, MIT; `z.toJSONSchema()` exists in Zod 4) and derive JSON Schema for: Chrome/Edge `responseConstraint` (JSON Schema or RegExp), WebLLM XGrammar `response_format` with a schema, `@huggingface/transformers-structured-output` (JSON Schema / JSON object / regex; batch size 1), and Anthropic structured outputs (`output_config.format`; strict tools). Sources: [npm zod](https://registry.npmjs.org/zod/latest), [prompt-api README](https://github.com/webmachinelearning/prompt-api), [WebLLM README](https://raw.githubusercontent.com/mlc-ai/web-llm/main/README.md), [transformers.js releases](https://github.com/huggingface/transformers.js/releases), [Anthropic retention table, structured outputs row](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention).
2. **Schema design for 0.6–2B models [inference]:** flat objects, closed `enum`s for project type / forms of capital / bioregion candidates (give the model the allowed list), `null`able fields instead of required free text, arrays capped by instruction rather than `maxItems`; avoid `maxLength` (Chrome's guidance warns it produces compressed, odd output — [Google guidance](https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/guides/built-in-ai/language-model.md)); greedy decoding (`temperature=0` sampling was fixed in Transformers.js 3.7.6).
3. **Validate → repair → re-ask → degrade:** `schema.safeParse(JSON.parse(text))`; on failure run `jsonrepair` (3.15.0, ISC; repairs malformed/truncated JSON, browser UMD build) and re-parse; if still invalid, re-prompt once with the Zod issue list appended; after two failures keep valid fields and mark the rest "needs review" in the UI. Source: [npm jsonrepair](https://registry.npmjs.org/jsonrepair/latest).
4. **Long inputs:** split extracted text into ~1,500-token chunks, extract per chunk, merge by field with de-duplication using the embedding model you already ship (cosine ≥0.9 → same tag), then one final pass over the merged candidate list **[inference]**.
5. **Grammar-constrained decoding tradeoff [inference]:** constraints guarantee parseability, not correctness; keep the enum lists and few-shot examples in the prompt even when a grammar is active, and log the raw model text alongside the parsed object for later evaluation.

---

## D. Privacy-preserving cloud fallback

### D.1 Anthropic Claude API

- **Retention model:** "Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models, which require 30-day retention." Covered Models are Claude Fable 5.1, Mythos 5.1, Fable 5, Mythos 5; requests to them from a ZDR org return `400 invalid_request_error` unless 30-day retention is enabled for that workspace. **Zero Data Retention** is granted per organization via sales/account team. Even under ZDR, content flagged by trust-and-safety systems may be kept up to 2 years. Under ZDR, **CORS is not supported** — browser apps must call through a backend proxy (a Vercel function in this stack). Structured outputs are "Yes (qualified)": prompts/outputs not stored, but the JSON schema is cached up to 24 h, so never put personal data in schema enums. Batch API (29-day retention) and Files API are not ZDR-eligible. Standard (non-ZDR) commercial retention is defined in the privacy center article linked from the page (third-party trackers report 30-day deletion; verify there). Source: [platform.claude.com API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); standard policy: [privacy.claude.com article 7996866](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).
- **Data residency:** `inference_geo` on `/v1/messages` is ZDR- and HIPAA-eligible (same table), so EU inference can be pinned **[per that row; check availability for your account]**.
- **Current models for cheap extraction (Anthropic model table cached 2026-10-06 in the claude-api skill):** `claude-haiku-5-5` $0.10 in / $0.50 out per MTok for prompts ≤100K tokens ($0.50/$2.50 above), 1M context, adaptive thinking on by default (effort `medium`); `claude-sonnet-5-5` $2/$10; `claude-opus-5-5` $4/$20 (recommended default for quality); `claude-fable-5-1` $10/$50 but a Covered Model (30-day retention, no ZDR). Use `output_config.format` for schema-constrained JSON and `strict: true` tools; assistant prefill is rejected on these models. A typical 2k-token intake extraction with Haiku 5.5 costs ≈ $0.0003–0.0005 **[arithmetic]**. Source: skill tables above (Anthropic docs); live prices at [platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing).

### D.2 Cloudflare Workers AI

- **Pricing (page updated 20 Oct 2026):** 10,000 Neurons/day free on Free and Paid plans; $0.011 per 1,000 Neurons beyond. Per-model USD per million tokens (in/out): Llama 3.2 1B $0.027/$0.201; Llama 3.2 3B $0.051/$0.335; Llama 3.1 8B fp8-fast $0.045/$0.384; Qwen3 30B-A3B fp8 $0.051/$0.335; Gemma 4 26B-A4B $0.100/$0.300; Gemma 3 12B $0.345/$0.556; gpt-oss-20b $0.200/$0.300; gpt-oss-120b $0.350/$0.750; Llama 3.3 70B $0.293/$2.253. Whisper and whisper-large-v3-turbo $0.0005 per audio minute. Source: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- **Data policy:** "Cloudflare does not use Customer Content processed by Workers AI to train AI models"; inputs/outputs are not retained after they are no longer needed unless you use a storage feature (AI Gateway logging/caching, R2, Vectorize, batch); no fixed retention periods or regional-processing statement on the page. Source: [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

### D.3 Open-model hosts

- **Fireworks:** "does not log or store prompt or generation data for any open models, without explicit user opt-in" (token-count metadata is logged); with prompt caching, data may sit in volatile memory for minutes; Responses API with `store=true` keeps conversations up to 30 days. Source: [Fireworks data handling](https://docs.fireworks.ai/guides/security_compliance/data_handling).
- **Groq:** official docs describe a self-serve Zero Data Retention switch under Data Controls; default retention wording is inconsistent across sources (30 days vs none); the docs page returned 403 to automated fetch, so confirm manually. Sources: [console.groq.com/docs/your-data](https://console.groq.com/docs/your-data), [third-party retention tracker](https://www.developersdigest.tech/models/data-retention/groq).
- **Together:** org-level "Store prompts and model responses" toggle (ZDR), training use is a separate opt-in; sources disagree on the default, so set it explicitly. Sources: [Together ZDR docs](https://docs.together.ai/docs/zero-data-retention), [Together privacy & security](https://docs.together.ai/docs/privacy-and-security.md).

### D.4 Self-hosted (community server)

- **Hardware (Hetzner dedicated GPU, EUR net, Oct 2026):** GEX45 — RTX PRO 4000 Blackwell SFF 24 GB, 64 GB RAM, €214/mo + €209 setup (Helsinki); GEX63 — RTX PRO 6000 Blackwell Max-Q 96 GB, €999/mo + €999 setup; GEX131 from €1,499/mo; GEX430 (4×96 GB) €3,599/mo. A 24 GB card runs Qwen3-8B/14B-class or Gemma 4 E4B at 4–8-bit with vLLM comfortably **[inference]**. Source: [Hetzner GPU matrix](https://www.hetzner.com/dedicated-rootserver/matrix-gpu/).
- **Software:** vLLM (OpenAI-compatible server, JSON-schema structured outputs via guided decoding backends) or Ollama (`format` = JSON schema) — see sources appended in §D.5 after verification.

### D.5 Making the fallback consent-based and auditable [design recommendations, inference unless cited]

1. **Default off, per-session or per-field opt-in.** The dialog names the provider, model, region, retention term (quote the vendor statement), and what is sent (text only; audio and files never leave the device unless separately ticked). GDPR Art. 7(1) requires the controller to be able to demonstrate consent, and 7(3) that withdrawal is as easy as giving it ([gdpr-info.eu Art. 7](https://gdpr-info.eu/art-7-gdpr/)).
2. **Consent ledger in Postgres (RLS, append-only):** `ai_consent_events(id, member_id, initiative_id, provider, model, purpose, data_categories[], policy_version, granted_at, withdrawn_at)` and `ai_calls(id, consent_event_id, provider, model, prompt_sha256, response_sha256, input_tokens, output_tokens, latency_ms, created_at)`; store hashes and derived tags, never raw prompts, so the server never becomes a second copy of the user's text.
3. **Server-side proxy only** (Anthropic ZDR forbids CORS; keys never ship to the browser), with an allowlist of providers and a per-member monthly token budget.
4. **Minimise what leaves:** send the already-extracted plain text (not PDFs/images) and the schema; strip emails/phones client-side before upload; prefer EU inference where offered (`inference_geo`).
5. **User-visible audit:** a "Where did my data go?" panel listing each cloud call with provider, timestamp, token counts and the retention statement in force, plus an export.
6. **Self-hosted option for the community:** vLLM's OpenAI-compatible server supports JSON Schema (via `response_format: {type:"json_schema"}` or `structured_outputs`), regex, choice and grammar constraints with `xgrammar`/`guidance` backends (legacy `guided_*` fields removed in v0.12.0); Ollama accepts a JSON Schema in the `format` parameter (post dated 6 Dec 2024). Either runs on the Hetzner boxes above. Sources: [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html), [Ollama structured outputs](https://ollama.com/blog/structured-outputs).

---

## E. Supabase

### E.1 Email + one-time code (OTP) with Supabase Auth

- **Mechanism:** Magic links and email OTPs are the same flow; `signInWithOtp({ email, options: { shouldCreateUser, emailRedirectTo } })` sends a magic link by default, and the email becomes a *code* email simply by putting `{{ .Token }}` in the Magic Link template. `shouldCreateUser: false` blocks sign-ups for unknown emails (useful for invite-only cohorts). Verify with `verifyOtp({ email, token, type: 'email' })` (returns a session). The code is **6 digits by default** (the Send Email hook payload documents `token` as "a six-digit numeric OTP" and `token_hash` as 16–30 chars); the CLI config reference documents `auth.email.otp_length` with a permitted range of **6–10 digits** (passed to GoTrue as `GOTRUE_MAILER_OTP_LENGTH`), so 8-digit codes are possible for hosted projects via config/Management API — do not hard-code a 6-digit regex client-side. Sources: [CLI config reference](https://supabase.com/docs/reference/cli/config), [supabase/cli issue 2802](https://github.com/supabase/cli/issues/2802). Default expiry **1 hour** ("Email OTP expiration"; values above 86,400 s are discouraged and only settable via the Management API); **one send per user per 60 s**. Sources: [Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).
- **Rate limits (per project / per IP, configurable in Authentication → Rate Limits):** emails sent — built-in provider 2/hour (team addresses only, not for production); custom SMTP or Send Email hook — you set it (default 30/hour after adding SMTP); `/otp`, `/magiclink`, `/signup`, `/recover` 30 per 5 min per IP; `/verify` 30 per 5 min per IP; token refresh 150 per 5 min; anonymous sign-ins 30/hour. Sources: [Rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- **Template variables:** `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .Email }}`, `{{ .Data }}` (user metadata). Source: [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- **Magic-link / PKCE pitfalls on mobile email clients:** (1) link scanners such as Microsoft Defender Safe Links pre-fetch `{{ .ConfirmationURL }}` and consume the single-use token → "Token has expired or is invalid"; (2) under PKCE the exchange "must be initiated on the same browser and device where the flow was started" because the code verifier is stored locally — a link opened from a mail app's in-app browser or a different default browser fails; the auth code lasts 5 minutes, single use; starting a second flow overwrites the verifier (experimental `appendPkceFlowIdToRedirects`). Supabase's own mitigations are exactly your design: send `{{ .Token }}` and verify with `verifyOtp`, or link to your own page carrying `token_hash` and show a button (no auto-verify on GET). Sources: [Email templates — prefetching](https://supabase.com/docs/guides/auth/auth-email-templates), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
- **Recommendation [inference]:** code-first UI (email field → 6-digit input), `type:'email'`, `shouldCreateUser` controlled by an allow-list or open sign-up per product decision, plus a secondary `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email` button link; keep the implicit flow for the SPA (PKCE buys little when the code is typed). Set the email rate limit to a realistic number (e.g., 200/hour) once Resend is attached.

### E.2 Resend with Supabase Auth: custom SMTP vs Send Email Hook

- **Custom SMTP:** Resend is listed among compatible SMTP providers; after saving SMTP settings Auth can email any address, with a default 30/hour cap you raise in Rate Limits. Templates stay in Supabase (Go templates). Source: [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- **Send Email Hook (HTTP):** "replaces Supabase's built-in email sending"; Supabase POSTs `{ user, email_data: { token, token_hash, redirect_to, email_action_type, … } }` to your HTTPS endpoint (Edge Function), signed with Standard Webhooks (`SEND_EMAIL_HOOK_SECRET`, strip the `v1,whsec_` prefix; verify with `standardwebhooks`); an empty 200 means success; no hook timeout or platform retry is documented; the official example deploys with `--no-verify-jwt`, renders React Email with `renderAsync`, and sends through the Resend SDK. The hook is the documented route when you want React/branded templates, localization, queueing, provider failover, extra headers, or non-SMTP providers. Sources: [Send Email hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Resend + React Email example](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend), [Custom SMTP — when to use the hook](https://supabase.com/docs/guides/auth/auth-smtp).
- **Which now [inference]:** use the **hook** — it unifies auth mail and the weekly digest on one Resend/React Email pipeline and lets you set `Idempotency-Key`, tags and subject per `email_action_type`; fix the example's known gaps (hardcoded `from`, 401 for all errors, unencoded `redirect_to`, single template). Keep SMTP configured as a manual fallback. Remember the rate-limit row "custom SMTP or Send Email hook" still applies.

### E.3 Row Level Security for member-owned records

Enable RLS and re-grant minimal privileges in a migration; scope policies `to authenticated`; use `(select auth.uid())` so Postgres evaluates it once per statement; one policy per command (`using` for select/delete, `with check` for insert, both for update); put membership checks in a `security definer` function in a non-exposed `private` schema with `set search_path = ''` to avoid recursive-policy error `42P17`; index every column a policy compares; restrictive policies for step-up (e.g., AAL2); `service_role`/secret keys bypass RLS and never reach the browser. Source: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). Domain mapping **[inference]**: `initiatives(owner_id)`, `initiative_members(initiative_id, member_id, role)`, `needs`/`offers(initiative_id)`; policies via `private.is_initiative_member(initiative_id)`; public discovery through a `published` flag policy or a view.

### E.4 pgvector, hybrid search, PostGIS

- **HNSW:** "should be your default choice"; `create index on t using hnsw (embedding vector_cosine_ops)` (`vector_l2_ops`, `vector_ip_ops` for `<->`, `<#>`); `vector` ≤2,000 dims, `halfvec` ≤4,000 (cast for 3,072-dim models); pgvector 0.8.0+ `hnsw.iterative_scan = relaxed_order|strict_order`, `hnsw.max_scan_tuples` (20,000) for filtered queries that under-fill `LIMIT`. Build defaults `m=16`, `ef_construction=64`; query-time `hnsw.ef_search=40` (raise for recall); builds are fast when the graph fits `maintenance_work_mem`; current pgvector 0.8.7. Sources: [HNSW indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes), [pgvector README](https://github.com/pgvector/pgvector).
- **Hybrid search:** generated `tsvector` column + GIN index, HNSW on the embedding, and a `hybrid_search(query_text, query_embedding, match_count, full_text_weight, semantic_weight, rrf_k=50)` function that fuses `ts_rank_cd` and `<#>` rankings with reciprocal rank fusion. Use the same text-search config on both sides. Source: [Hybrid search](https://supabase.com/docs/guides/ai/hybrid-search). At ~700 funders and low thousands of initiatives, exact scans are fine and the index is optional **[inference]**.
- **PostGIS:** available; enable with `create extension if not exists postgis with schema extensions;` (never in `public`, or `spatial_ref_sys` is exposed through the Data API); `geography(POINT)` + GiST; `<->` KNN ordering via an RPC; longitude first. Store bioregion boundaries as polygons and tag initiatives by point-in-polygon (`ST_Intersects`) **[standard PostGIS, inference]**. Source: [PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis).

### E.5 Weekly digests: pg_cron + pg_net or Edge Functions, Realtime, Storage

- **Scheduling:** `cron.schedule('weekly-digest', '0 7 * * 1', $$ select net.http_post(url := <project_url>/functions/v1/digest, headers := jsonb_build_object('Content-Type','application/json','apikey', <secret from vault>), body := …) $$)`; store `project_url` and a **secret key** (not the publishable key) in Vault; set the function's `verify_jwt` off and `auth` to `'secret'`. Caveat: the decrypted key sits in `net.http_request_queue` until sent, readable by login-capable roles. Supabase Cron (pg_cron) supports schedules "from every second to once a year", recommends **≤8 concurrent jobs** and jobs **≤10 minutes**, and logs runs to `cron.job_run_details` (no plan gating stated). Edge Function limits matter for the digest worker: wall-clock **150 s on Free / 400 s on paid**, 2 s active CPU per request, 256 MB memory, 150 s idle timeout (504) — so the weekly job should enqueue per-member batches (e.g., 100 recipients per Resend batch call) and return quickly rather than loop over all members in one invocation **[inference]**. Sources: [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [Supabase Cron](https://supabase.com/docs/guides/cron), [Edge Functions limits](https://supabase.com/docs/guides/functions/limits).
- **Alternative:** Vercel Cron (§G) hitting a Vercel function that reads Supabase with the service key and sends Resend batches. Prefer pg_cron → Edge Function to keep secrets and data in one trust boundary **[inference]**.
- **Realtime:** Broadcast, Presence, Postgres Changes; Free 200 peak connections / 2M messages per month, Pro 500 / 5M. Useful for "new reciprocal match" notifications, not required for v1. Sources: [Realtime](https://supabase.com/docs/guides/realtime), [Pricing](https://supabase.com/pricing).
- **Storage with RLS:** policies on `storage.objects` per command; identity via `auth.jwt()->>'sub'` (or `auth.uid()`), per-user folders with `(storage.foldername(name))[1] = <uid>`, `owner_id` for owner-only reads, `storage.allow_any_operation()` to avoid list exposure on public buckets; service key bypasses RLS. Global file-size limit **50 MB on Free (fixed)**, up to 500 GB on Pro/Team; per-bucket limits and MIME allow-lists. Files that may exceed 6 MB (decks, scans) should use resumable TUS uploads (`https://<ref>.storage.supabase.co/storage/v1/upload/resumable`, fixed 6 MB chunks, upload URLs valid ≤24 h, `409` on concurrent writers) from `tus-js-client`/Uppy. Sources: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [File limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

### E.6 Pricing relevant to a small nonprofit (31 Oct 2026)

| | Free | Pro ($25/mo + usage) |
|---|---|---|
| Database | 500 MB | 8 GB disk, $0.125/GB beyond |
| Storage / egress | 1 GB / 5 GB | 100 GB / 250 GB ($0.0213/GB, $0.09/GB) |
| MAU | 50,000 | 100,000 ($0.00325/MAU) |
| Edge Function invocations | 500k | 2M ($2/M) |
| Realtime | 200 conn / 2M msgs | 500 conn / 5M msgs |
| Pausing | **paused after 1 week idle**, 2 active projects | never idle-paused |
| Compute credits / branching / logs | — / none / 1 day | $10 credit (one Micro) / $0.01344 per branch-hour / 7 days |
| Spend cap | n/a | on by default |

Team starts at $599/mo. Free's idle-pause and 50 MB upload cap make Pro the floor for anything members rely on **[inference]**. Source: [supabase.com/pricing](https://supabase.com/pricing).

### E.7 Migrations and branching workflow (CLI)

`supabase migration new <name>` → edit SQL → `supabase migration up` / `supabase db reset` (replays migrations + `supabase/seed.sql`) → commit → `supabase link` → `supabase db push` (`--include-seed` optional). `supabase db diff -f <name>` generates a migration from dashboard-made local changes (pg-delta or migra engine; declarative `supabase/schemas/` uses `db schema declarative sync`). Rule: "never change the remote database directly"; repair drift with `migration list`, `db pull`, `migration repair`. Branching (Pro+): GitHub integration creates a preview branch per PR with its own instance and keys, builds schema from the repo's migrations, seeds from `seed.sql`, applies `config.toml` (GitHub branches only), is data-less by default, auto-deletes on PR merge/close; persistent branches serve as staging; auth secrets arrive as placeholders. Sources: [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Branching](https://supabase.com/docs/guides/deployment/branching), [Pricing](https://supabase.com/pricing).

---

## F. Resend

- **Transactional vs Broadcasts:** `/emails` and `/emails/batch` for transactional (OTP, match alerts, digests); **Broadcasts** are marketing sends to Audiences (contacts added by hand, API or CSV), targeted by segments and topics, composed in a no-code editor or via the Broadcast API, with scheduling and open/click analytics. Source: [Broadcasts intro](https://resend.com/docs/dashboard/broadcasts/introduction).
- **Batch sending:** up to **100 emails per call**, ≤50 addresses per `to`; attachments **not supported** in batch; tags supported; `Idempotency-Key` header (unique per request, 24 h, ≤256 chars) prevents duplicate digests on retries; response `data[]` ids follow request order; `react` templates only in the Node SDK. Source: [Send batch emails](https://resend.com/docs/api-reference/emails/send-batch-emails).
- **Templates:** React Email's current manual setup installs `react-email` (6.11.6, MIT; components are imported from `react-email` itself), `@react-email/ui` (dev), `react`, `react-dom`; the older `@react-email/components` (1.0.12, MIT, React 18/19 peer) now carries an npm deprecation flag, and Supabase's hook example still imports it — prefer `react-email` imports and `@react-email/render` 2.x for `renderAsync`. The Resend Node SDK accepts a `react` element directly on single sends and batch. Sources: [React Email manual setup](https://react.email/docs/getting-started/manual-setup), [npm react-email](https://registry.npmjs.org/react-email/latest), [npm @react-email/components](https://registry.npmjs.org/@react-email/components/latest).
- **Inbound (replies):** receive on a verified domain (MX record) or on `<id>.resend.app`; Resend parses the message and attachments and POSTs an **`email.received`** webhook (37 event types in all, including `email.delivered/bounced/complained`, `contact.*`, `suppression.*`; retries reuse the same `svix-id`, so dedupe on it; webhook payloads omit `html`/`text`, which you fetch from the API); attachments via temporary download URLs; CLI and MCP options. Webhooks are Svix-signed (`svix-id`, `svix-timestamp`, `svix-signature`, value prefixed `v1,`); verify with the Resend SDK's webhook verifier or the `svix` package against the raw (un-reparsed) body; the docs flag replay risk but give no tolerance window, so enforce your own timestamp check. Retention and limits are not stated on the intro page. Sources: [Receiving emails](https://resend.com/docs/dashboard/receiving/introduction), [Webhook event types](https://resend.com/docs/dashboard/webhooks/event-types), [Verify webhook requests](https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests).
- **Pricing (31 Oct 2026):** Transactional — Free $0: 3,000/month, **100/day**, 3 domains; Pro $20 (50k) / $35 (100k); Scale from $90 (100k) to $1,150 (2.5M); Enterprise custom; 30-day email data retention on Free/Pro/Scale; dedicated IP $30/mo add-on on Scale (>3k/day); SSO $150/mo on Scale. Marketing (by contacts) — Free 1,000 contacts; $40 for 5k … $650 for 150k. Source: [resend.com/pricing](https://resend.com/pricing).
- **Deliverability:** verify a domain; Resend recommends sending from **subdomains** (e.g., `mail.` for transactional, `news.` for digests) to separate reputation and tracking settings; add DMARC (and BIMI) after verification; optional custom Return-Path subdomain; enforced TLS; disable open/click tracking on transactional mail. Exact DKIM/SPF record values are shown per domain in the add-domain flow. Source: [Domains intro](https://resend.com/docs/dashboard/domains/introduction).
- **Unsubscribe:** Resend does not manage lists for transactional mail; add `List-Unsubscribe: <https://…/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` via the `headers` field, answer POST with 200/202 and GET with your opt-out page, honour within 48 h (Gmail/Yahoo require RFC 8058 for senders >5k/day). For digests, keep a per-member `digest_opt_in` flag in Postgres and sign the token **[inference]**. If digests are sent as **Broadcasts** instead, Resend handles unsubscribes itself: the `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder becomes a per-recipient link to a preference page (per-topic or full opt-out), the no-code editor swaps its footer link automatically, and opted-out contacts are excluded from later sends to that audience; whether Resend also adds `List-Unsubscribe` headers to broadcasts is not stated. Sources: [Add unsubscribe to transactional emails](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails), [Create broadcasts with the API](https://resend.com/docs/dashboard/broadcasts/send-broadcast-with-api), [Broadcast API post](https://resend.com/blog/broadcast-api).
- **EU data residency:** four sending regions — North Virginia `us-east-1`, Ireland `eu-west-1`, São Paulo `sa-east-1`, Tokyo `ap-northeast-1` — and the region only determines where emails are "routed and sent from"; Resend states account data "including email metadata, logs, and API records" is "stored in the United States" regardless of region; changing a domain's region means deleting and re-adding it and repointing DNS. Treat Resend as a US processor under SCCs and keep digest bodies free of sensitive detail **[inference]**. Sources: [Resend regions doc](https://www.resend.com/docs/dashboard/domains/regions.md), [third-party EU-residency analysis](https://nuntly.com/blog/email-api-eu-data-residency).

---

## G. Vercel

- **Cron jobs (page updated 15 Jul 2026):** available on all plans, **100 cron jobs per project**; **Hobby: once per day minimum, ±59 min precision** (more frequent expressions fail deployment); Pro/Enterprise: per-minute with per-minute precision; billed as ordinary function invocations. Source: [Cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **Functions (Fluid compute, page updated 24 Aug 2026):** memory Hobby 2 GB/1 vCPU, Pro 4 GB/2 vCPU; **max duration Hobby 300 s; Pro 300 s default, 800 s max (1,800 s beta)**; **request/response body 4.5 MB** (413 beyond); bundle 250 MB (5 GB "large functions" beta); auto-concurrency to 30,000; default region `iad1` (set `fra1`/`arn1` for EU users); pricing on Active CPU + provisioned memory — "Waiting for I/O (e.g. calling AI models…) does not count towards active CPU time." Source: [Functions limits](https://vercel.com/docs/functions/limitations).
- **Edge vs Node for AI calls:** Vercel now says "We recommend migrating from edge to Node.js"; Next.js 16.3 removed `runtime = 'edge'`; Edge functions must start responding within 25 s (stream up to 300 s) and are capped at 1 MB (Hobby)/2 MB (Pro) gzipped code. Use the Node runtime with streaming responses for the cloud-fallback proxy. Source: [Edge runtime](https://vercel.com/docs/functions/runtimes/edge).
- **Uploads:** the 4.5 MB body limit means files must go browser → storage directly. Vercel Blob: files up to 5 TB, client uploads (no data-transfer charge) and multipart for >100 MB, private or public stores, 19 regions, S3-backed; Hobby includes 1 GB-month storage, 10 GB transfer, 10k simple / 2k advanced ops, then Blob is blocked for 30 days; Pro is usage-based (example rates: $0.023/GB-month, $0.40 per 1M simple ops, $5 per 1M advanced ops, $0.05/GB transfer in `iad1`). Supabase Storage (RLS, same auth context, 50 MB cap on Free) is the better fit here because access rules live next to the member data **[inference]**. Sources: [Vercel Blob](https://vercel.com/docs/vercel-blob), [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing).
- **Plan fit:** the Hobby plan "restricts users to non-commercial, personal use only" (fair-use guidelines) and has no team collaboration, so an organisation-run app belongs on Pro (developer seats $20/user/month; viewers free). Hobby includes 1M function invocations, 4 CPU-hours, 360 GB-hours memory, 100 GB fast data transfer per month. Source: [Hobby plan](https://vercel.com/docs/plans/hobby).
- **Subdomain of an existing domain (page updated 16 Sep 2026):** add `app.example.com` in Project → Settings → Domains and create a **CNAME** to the project-specific target Vercel shows (e.g., `d1d4fc829fe7bc7c.vercel-dns-017.com`); the apex can stay on any DNS host; if the apex belongs to another Vercel team, add the `_vercel` **TXT** record at the apex ("subdomain delegation"); wildcards need Vercel nameservers or `_acme-challenge` NS delegation; Hobby allows 50 custom domains per project; certificates are issued automatically. Source: [Add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

---

## H. Matching design references (two-sided, complementarity, hybrid eligibility)

1. Palomares, Porcel, Pizzato, Guy, Herrera-Viedma (2021), "Reciprocal Recommender Systems: Analysis of state-of-art literature, challenges and opportunities towards social recommendation", *Information Fusion* 69:103–127 — the reference survey; frames **preference fusion** (turning two one-way scores into one mutual score) as the core design choice for need↔offer matching. [arXiv 2007.16120](https://arxiv.org/abs/2007.16120v1)
2. Lappas, Liu, Terzi (2009), "Finding a team of experts in social networks", KDD '09, DOI 10.1145/1557019.1557074 — team formation as covering a required skill set while minimising communication cost; template for assembling initiative+funder+peer bundles that jointly cover needs. [dblp](https://dblp.org/rec/conf/kdd/LappasLT09)
3. Zihayat et al. (2016), "Team formation in large-scale expert networks" (arXiv 1611.02992) — adds bridging members when skill holders are not directly connected; relevant for brokered introductions. [arXiv](https://www.arxiv.org/pdf/1611.02992)
4. "Fair Reciprocal Recommendation in Matching Markets" (RecSys '24, arXiv 2409.00720) — envy-freeness as a fairness criterion for who gets exposed; useful to stop a few well-known funders/initiatives dominating digests. [arXiv](https://export.arxiv.org/pdf/2409.00720)
5. "Fast and Examination-agnostic Reciprocal Recommendation in Matching Markets" (arXiv 2306.09060) — transferable-utility matching to rank while controlling exposure to popular users. [arXiv listing](https://arxiv.deeppaper.ai/papers/2306.09060v2/similar?locale=en)
6. Nakada, Kawamura, Furukawa (2024), "Parallel and Mini-Batch Stable Matching for Large-Scale Reciprocal Recommender Systems", RecSys in HR '24 (arXiv 2411.19214) — stable-matching optimisation at scale; shows how to turn mutual scores into a stable assignment for a weekly "introductions" batch. [arXiv](https://arxiv.org/abs/2411.19214)
7. "Counterfactual Reciprocal Recommender Systems for User-to-User Matching" (KDD '25 two-sided marketplace workshop, arXiv 2508.01867) — corrects selection bias from past recommendations; relevant once digest clicks feed back into ranking. [arXiv](https://arxiv.org/html/2508.01867v1)
8. "Matching Researchers to Funding Calls: A Reproducible Institution-Level Framework" (arXiv 2604.06321, Apr 2026) and Zhang et al. (2024) NIH grant recommender with biomedical embeddings — embedding-based funder↔profile matching baselines. [arXiv](https://arxiv.org/pdf/2604.06321), [DOAJ record](https://openaccess.library.uitm.edu.my/find/Record/doaj-art-7ff1bf2803b84e82ad3bb0b0c56083d9)
9. Practice reference for **hybrid rule + embedding scoring**: Carbon Connect's matching engine weights hard eligibility rules (country mismatch → score 0) at 30% and embedding cosine similarity at 25% among five dimensions, with a text-similarity fallback when embeddings are missing — a concrete pattern for grant eligibility gates followed by semantic ranking. [docs](https://carbon-connect-docs.pages.dev/developer/services/matching-engine)
10. Complementarity-oriented team formation: Dorn & Dustdar (2011, TU Wien) argue teams must balance skill coverage against social connectivity and anticipate tasks needing complementary expertise; RECAST (Empirical Software Engineering, 2021) ranks candidate teams on role coverage, skill and collaboration fit; the WI'19 paper by Stefanidis et al. adds fairness across several concurrent projects — together a basis for "complementary offers" bundles rather than one-to-one matches. [TU Wien PDF](https://dsg.tuwien.ac.at/Staff/sd/papers/TUV-1841-2011-03-1.pdf), [RECAST](https://aminer.org/pub/60e2d8ca5244ab9dcbf6d665/automatic-team-recommendation-for-collaborative-software-development), [WI19 PDF](https://homepages.tuni.fi/konstantinos.stefanidis/docs/WI19.pdf)

Design takeaway **[inference]**: apply hard eligibility rules first (geography/bioregion, legal form, grant size, deadline), then a reciprocal score = fusion(initiative→funder fit, funder→initiative fit) from embeddings + tag overlap on forms of capital, then an exposure-fair selection (envy-free or stable-matching batch) for each weekly digest.

---

## Verify-before-build list

1. Run the T2 path (Qwen3-0.6B q4f16 + whisper-base) on an iPhone 11/12 with iOS 26 Safari and on a 4 GB Android phone; measure peak memory and tab survival (A.6 evidence is from 2024 WebKit bugs and one 2026 field test).
2. Confirm Gemma 3n E2B and Phi-4-mini load on Transformers.js 4.3.x WebGPU before listing them as options.
3. Confirm your Supabase project's OTP length setting location (CLI `auth.email.otp_length` is documented; dashboard exposure was not verified).
4. Confirm Groq's current default retention directly (docs page blocked automated fetch).
5. Check Resend's subprocessor list/DPA for the US-storage statement if EU residency matters to members.
6. Re-check Anthropic model IDs/prices at build time; the table used here is cached as of 2026-10-06.

---

## Sources

### A. In-browser LLM inference
- https://github.com/huggingface/transformers.js/releases
- https://huggingface.co/blog/transformersjs-v4
- https://registry.npmjs.org/@huggingface/transformers-structured-output
- https://huggingface.co/blog/cross-origin-storage
- https://huggingface.co/api/models/onnx-community/Qwen3-0.6B-ONNX/tree/main/onnx
- https://huggingface.co/api/models/onnx-community/Qwen3-1.7B-ONNX/tree/main/onnx
- https://huggingface.co/api/models/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx
- https://ai.google.dev/gemma/docs/releases
- https://huggingface.co/api/models/onnx-community/gemma-3-1b-it-ONNX/tree/main/onnx
- https://huggingface.co/onnx-community/gemma-3n-E2B-it-ONNX
- https://huggingface.co/api/models/HuggingFaceTB/SmolLM3-3B-ONNX/tree/main/onnx
- https://huggingface.co/onnx-community/Phi-4-mini-instruct-ONNX-MHA
- https://github.com/huggingface/transformers.js/issues/1460
- https://huggingface.co/api/models/onnx-community/LFM2-1.2B-ONNX/tree/main/onnx
- https://docs.liquid.ai/docs/inference/onnx
- https://github.com/mlc-ai/web-llm/releases
- https://registry.npmjs.org/@mlc-ai/web-llm/latest
- https://raw.githubusercontent.com/mlc-ai/web-llm/main/README.md
- https://bugs.webkit.org/show_bug.cgi?id=275958
- https://hackernews-dynamic.seasondane.workers.dev/news/48624985
- https://raw.githubusercontent.com/GoogleChrome/modern-web-guidance/main/skills/modern-web-guidance/guides/built-in-ai/language-model.md
- https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API
- https://developer.chrome.com/docs/ai/prompt-api
- https://web-platform-dx.github.io/web-features-explorer/features/languagemodel/
- https://github.com/webmachinelearning/prompt-api
- https://learn.microsoft.com/microsoft-edge/web-platform/prompt-api
- https://registry.npmjs.org/@litert-lm/core
- https://github.com/google-ai-edge/LiteRT-LM
- https://ai.google.dev/edge/litert-lm/js
- https://developer.apple.com/documentation/updates/foundationmodels.md
- https://www.macrumors.com/2026/06/09/apple-outlines-major-ai-and-developer-tool-updates/
- https://en.wikipedia.org/wiki/WebGPU
- https://www.firefox.com/ia/firefox/notes
- https://simonwillison.net/2025/Jul/16/webgpu-firefox
- https://bugs.webkit.org/show_bug.cgi?id=299237
- https://web.dev/blog/webgpu-supported-major-browsers
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- https://bugs.webkit.org/show_bug.cgi?id=269777
- https://bugs.webkit.org/show_bug.cgi?id=268816
- https://bugs.webkit.org/show_bug.cgi?id=269937
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://docs.didomi.io/releases-and-announcements/announcements/apple-implements-7-day-cap-on-script-writable-storage
- https://swoff.netlify.app/docs/concepts/ios-safari-limitations
- https://barndoors.lumafield.com/3x-faster-project-loads-with-the-origin-private-file-system/
- https://github.com/P0u4a/opfs-cache

### B. Speech-to-text
- https://huggingface.co/api/models/onnx-community/whisper-large-v3-turbo/tree/main/onnx
- https://huggingface.co/api/models/onnx-community/whisper-base/tree/main/onnx
- https://redlib.hackliberty.org/r/LocalLLaMA/comments/1ftlznt/openais_new_whisper_turbo_model_running_100
- https://huggingface.co/striimit/whisper-large-v3-turbo-webgpu
- https://huggingface.co/spaces/webml-community/moonshine-web/raw/main/README.md
- https://github.com/usefulsensors/moonshine
- https://huggingface.co/Phreak87/moonshine-base-de-onnx
- https://www.pkgstats.com/pkg:parakeet.js
- https://gh.r-mj.com/ysdede/tdt-webgpu-demo
- https://docs.rs/crate/parakeet-rs/0.2.1
- https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/install_static
- https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/Rlyc2uAsFCY
- https://learn.microsoft.com/en-us/microsoft-edge/web-platform/speech-recognition-api
- https://blog.addpipe.com/apple-speechanalyzer-api/
- https://discussions.apple.com/thread/255492924
- https://www.testmuai.com/web-technologies/mediarecorder/
- https://webkit.org/blog/11353/mediarecorder-api/
- https://docs.w3cub.com/dom/mediarecorder/istypesupported_static

### C. Document extraction and structured output
- https://registry.npmjs.org/pdfjs-dist/latest
- https://registry.npmjs.org/mammoth/latest
- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- https://registry.npmjs.org/xlsx/latest
- https://registry.npmjs.org/tesseract.js/latest
- https://cdn.jsdelivr.net/npm/pptxtojson@2.2.0/README.md
- https://www.pkgstats.com/pkg:pptx-browser
- https://huggingface.co/api/models/HuggingFaceTB/SmolVLM-256M-Instruct/tree/main/onnx
- https://huggingface.co/api/models/onnx-community/Florence-2-base-ft/tree/main/onnx
- https://huggingface.co/Xenova/moondream2
- https://registry.npmjs.org/zod/latest
- https://registry.npmjs.org/jsonrepair/latest

### D. Cloud fallback
- https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- https://platform.claude.com/docs/en/about-claude/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/data-usage/
- https://docs.fireworks.ai/guides/security_compliance/data_handling
- https://console.groq.com/docs/your-data
- https://www.developersdigest.tech/models/data-retention/groq
- https://docs.together.ai/docs/zero-data-retention
- https://docs.together.ai/docs/privacy-and-security.md
- https://www.hetzner.com/dedicated-rootserver/matrix-gpu/
- https://docs.vllm.ai/en/latest/features/structured_outputs.html
- https://ollama.com/blog/structured-outputs
- https://gdpr-info.eu/art-7-gdpr/

### E. Supabase
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- https://supabase.com/docs/reference/cli/config
- https://github.com/supabase/cli/issues/2802
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- https://github.com/pgvector/pgvector
- https://supabase.com/docs/guides/ai/hybrid-search
- https://supabase.com/docs/guides/database/extensions/postgis
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/realtime
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- https://supabase.com/pricing
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/deployment/branching

### F. Resend
- https://resend.com/docs/dashboard/broadcasts/introduction
- https://resend.com/docs/api-reference/emails/send-batch-emails
- https://react.email/docs/getting-started/manual-setup
- https://registry.npmjs.org/react-email/latest
- https://registry.npmjs.org/@react-email/components/latest
- https://resend.com/docs/dashboard/receiving/introduction
- https://resend.com/docs/dashboard/webhooks/event-types
- https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
- https://resend.com/pricing
- https://resend.com/docs/dashboard/domains/introduction
- https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
- https://resend.com/docs/dashboard/broadcasts/send-broadcast-with-api
- https://resend.com/blog/broadcast-api
- https://www.resend.com/docs/dashboard/domains/regions.md
- https://nuntly.com/blog/email-api-eu-data-residency

### G. Vercel
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/runtimes/edge
- https://vercel.com/docs/vercel-blob
- https://vercel.com/docs/vercel-blob/usage-and-pricing
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/domains/working-with-domains/add-a-domain

### H. Matching references
- https://arxiv.org/abs/2007.16120v1
- https://dblp.org/rec/conf/kdd/LappasLT09
- https://www.arxiv.org/pdf/1611.02992
- https://export.arxiv.org/pdf/2409.00720
- https://arxiv.deeppaper.ai/papers/2306.09060v2/similar?locale=en
- https://arxiv.org/abs/2411.19214
- https://arxiv.org/html/2508.01867v1
- https://arxiv.org/pdf/2604.06321
- https://openaccess.library.uitm.edu.my/find/Record/doaj-art-7ff1bf2803b84e82ad3bb0b0c56083d9
- https://carbon-connect-docs.pages.dev/developer/services/matching-engine
- https://dsg.tuwien.ac.at/Staff/sd/papers/TUV-1841-2011-03-1.pdf
- https://aminer.org/pub/60e2d8ca5244ab9dcbf6d665/automatic-team-recommendation-for-collaborative-software-development
- https://homepages.tuni.fi/konstantinos.stefanidis/docs/WI19.pdf
