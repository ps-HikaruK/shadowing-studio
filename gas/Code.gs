/**
 * Shadowing Studio - Gemini TTS proxy (Google Apps Script Web App)
 *
 * Script Properties:
 *   GEMINI_API_KEY   (必須) Gemini Developer API のキー
 *   SHARED_TOKEN     (任意) アプリ側の設定と一致させる共有トークン
 *   MAX_CHARS        (任意) 1 リクエストあたりの最大文字数。既定 600
 *   DAILY_LIMIT      (任意) 1 日あたりの最大リクエスト数。既定 400
 *   ALLOWED_MODELS   (任意) カンマ区切りの許可モデル
 *
 * リクエスト(POST, text/plain の JSON):
 *   { text, voice, model, variant, prompt, token, cacheKey }
 * レスポンス(JSON):
 *   { ok: true, audioBase64, mimeType, model }
 *   { ok: false, error, code }
 */

var DEFAULT_MODEL = "gemini-2.5-flash-preview-tts";
var DEFAULT_ALLOWED_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
  "gemini-3.1-flash-tts-preview",
];
var ALLOWED_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe",
  "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib",
  "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima",
  "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];

function doGet() {
  return jsonResponse({ ok: true, service: "shadowing-studio-tts", version: 1 });
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, code: "config", error: "GEMINI_API_KEY is not set" });

  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return jsonResponse({ ok: false, code: "bad_request", error: "Invalid JSON" });
  }

  var sharedToken = props.getProperty("SHARED_TOKEN");
  if (sharedToken && body.token !== sharedToken) {
    return jsonResponse({ ok: false, code: "unauthorized", error: "Invalid token" });
  }

  var text = String(body.text || "").trim();
  var prompt = String(body.prompt || text).trim();
  var voice = String(body.voice || "Schedar");
  var model = String(body.model || DEFAULT_MODEL);
  var maxChars = Number(props.getProperty("MAX_CHARS") || 600);
  var dailyLimit = Number(props.getProperty("DAILY_LIMIT") || 400);
  var allowedModels = (props.getProperty("ALLOWED_MODELS") || DEFAULT_ALLOWED_MODELS.join(","))
    .split(",")
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  if (!text) return jsonResponse({ ok: false, code: "bad_request", error: "text is required" });
  if (text.length > maxChars)
    return jsonResponse({ ok: false, code: "too_long", error: "text exceeds " + maxChars + " chars" });
  if (ALLOWED_VOICES.indexOf(voice) < 0)
    return jsonResponse({ ok: false, code: "bad_request", error: "unknown voice: " + voice });
  if (allowedModels.indexOf(model) < 0)
    return jsonResponse({ ok: false, code: "bad_request", error: "model not allowed: " + model });

  // 同一キャッシュキーの短時間の重複リクエストを拒否(クライアント側キャッシュの取りこぼし対策)
  var cache = CacheService.getScriptCache();
  var cacheKey = body.cacheKey ? "ck:" + String(body.cacheKey).slice(0, 200) : null;
  if (cacheKey && cache.get(cacheKey)) {
    return jsonResponse({ ok: false, code: "duplicate", error: "Duplicate request for the same cache key" });
  }

  // 1 日あたりの上限
  var dayKey = "count:" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd");
  var count = Number(cache.get(dayKey) || 0);
  if (count >= dailyLimit)
    return jsonResponse({ ok: false, code: "daily_limit", error: "Daily limit reached (" + dailyLimit + ")" });

  var result = callGemini(apiKey, model, voice, prompt);
  if (!result.ok) return jsonResponse(result);

  cache.put(dayKey, String(count + 1), 21600 * 4); // 24h
  if (cacheKey) cache.put(cacheKey, "1", 120);
  return jsonResponse({ ok: true, audioBase64: result.audioBase64, mimeType: result.mimeType, model: model });
}

function callGemini(apiKey, model, voice, prompt) {
  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  var lastError = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-goog-api-key": apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    var status = res.getResponseCode();
    var textBody = res.getContentText();
    if (status === 200) {
      var json;
      try {
        json = JSON.parse(textBody);
      } catch (err) {
        return { ok: false, code: "server", error: "Invalid JSON from Gemini" };
      }
      var candidate = json.candidates && json.candidates[0];
      if (candidate && candidate.finishReason === "PROHIBITED_CONTENT") {
        return { ok: false, code: "prohibited_content", error: "Rejected by safety classifier" };
      }
      var parts = (candidate && candidate.content && candidate.content.parts) || [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].inlineData && parts[i].inlineData.data) {
          return {
            ok: true,
            audioBase64: parts[i].inlineData.data,
            mimeType: parts[i].inlineData.mimeType || "audio/L16;codec=pcm;rate=24000",
          };
        }
      }
      // まれにテキストが返る(公式ドキュメントの既知事項)→ リトライ
      lastError = { ok: false, code: "server", error: "No audio in response" };
      continue;
    }
    if (status === 429) return { ok: false, code: "rate_limit", error: describeQuotaError(textBody) };
    if (status === 400 || status === 403) {
      return { ok: false, code: "bad_request", error: "Gemini " + status + ": " + textBody.slice(0, 300) };
    }
    lastError = { ok: false, code: "server", error: "Gemini " + status + ": " + textBody.slice(0, 300) };
    Utilities.sleep(1500);
  }
  return lastError || { ok: false, code: "server", error: "Unknown error" };
}

/**
 * 429 の本文から「どの枠が・上限いくつで・何秒後に再試行か」を抜き出す。
 * limit: 0 ならそのモデルに無料枠がない(請求先の登録、または別モデルが必要)。
 */
function describeQuotaError(textBody) {
  var message = "";
  try {
    var json = JSON.parse(textBody);
    message = (json.error && json.error.message) || "";
  } catch (err) {
    message = textBody || "";
  }
  var parts = [];
  var limitMatch = message.match(/limit:\s*(\d+)[^\n]*model:\s*([\w.\-]+)/);
  if (limitMatch) parts.push("limit=" + limitMatch[1] + " model=" + limitMatch[2]);
  var quotaIds = [];
  var re = /quotaId"?:\s*"?([A-Za-z\-]+)/g;
  var m;
  while ((m = re.exec(textBody)) !== null) {
    if (quotaIds.indexOf(m[1]) < 0) quotaIds.push(m[1]);
  }
  if (quotaIds.length) parts.push("quota=" + quotaIds.join(","));
  var retryMatch = message.match(/retry in\s*([\d.]+)s/i);
  if (retryMatch) parts.push("retry=" + Math.ceil(Number(retryMatch[1])) + "s");
  var summary = parts.length ? parts.join(" / ") : message.slice(0, 200);
  return "Gemini 429: " + summary;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** エディタから実行して動作確認する */
function testSynthesize() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  var r = callGemini(apiKey, DEFAULT_MODEL, "Schedar", "Say naturally: Hey, how's it going?");
  Logger.log(r.ok ? "OK " + r.mimeType + " " + r.audioBase64.length + " chars" : JSON.stringify(r));
}

/**
 * エディタから実行して、各 TTS モデルの状態(成功 / 429 の枠 / その他)を一覧する。
 * 429 で limit=0 と出るモデルは、そのプロジェクトでは無料枠がない。
 */
function testDiagnose() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    Logger.log("GEMINI_API_KEY is not set");
    return;
  }
  Logger.log("key prefix: " + apiKey.slice(0, 8) + "... (length " + apiKey.length + ")");

  // モデル一覧が取れるか(キーの有効性・API 有効化の確認)
  var listRes = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    method: "get",
    headers: { "x-goog-api-key": apiKey },
    muteHttpExceptions: true,
  });
  var listStatus = listRes.getResponseCode();
  if (listStatus !== 200) {
    Logger.log("models.list -> HTTP " + listStatus + ": " + listRes.getContentText().slice(0, 300));
  } else {
    var models = (JSON.parse(listRes.getContentText()).models || [])
      .map(function (mm) { return String(mm.name || "").replace(/^models\//, ""); })
      .filter(function (n) { return /tts/i.test(n); });
    Logger.log("TTS models visible to this key: " + (models.length ? models.join(", ") : "(none)"));
  }

  for (var i = 0; i < DEFAULT_ALLOWED_MODELS.length; i++) {
    var model = DEFAULT_ALLOWED_MODELS[i];
    var res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent",
      {
        method: "post",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey },
        payload: JSON.stringify({
          contents: [{ parts: [{ text: "Say: hi." }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Schedar" } } },
          },
        }),
        muteHttpExceptions: true,
      }
    );
    var status = res.getResponseCode();
    var body = res.getContentText();
    if (status === 200) Logger.log(model + " -> OK");
    else if (status === 429) Logger.log(model + " -> " + describeQuotaError(body));
    else Logger.log(model + " -> HTTP " + status + ": " + body.slice(0, 200));
    Utilities.sleep(1000);
  }
}
