import { expect, test, type Page } from "@playwright/test";

const SCRIPT = `**Corrected script**

A: Hey, sorry I'm late. The train was packed this morning.
（遅れてごめん。今朝は電車が混んでてね。）
B: No worries. Wanna grab a coffee before we start?
A: Sure, I could use one.

---
修正ポイント:
- "packed" は「満員」の意味。`;

async function enableDemoMode(page: Page) {
  await page.goto("/#/settings");
  const demo = page.getByRole("checkbox").first();
  if (!(await demo.isChecked())) await demo.check();
  await expect(demo).toBeChecked();
}

test.describe("教材作成からプレーヤーまで", () => {
  test("貼り付け → 分割 → 生成 → 再生 → 再開位置の保持", async ({ page }) => {
    await enableDemoMode(page);

    await page.goto("/#/new");
    await page.getByPlaceholder(/例:/).fill(SCRIPT);
    await page.getByRole("button", { name: "分割して確認する" }).click();

    // 日本語行・見出し以外が文単位で 6 セグメントになる
    await expect(page.getByText("6 セグメント")).toBeVisible();
    const textareas = page.locator("textarea");
    await expect(textareas).toHaveCount(6);
    await expect(textareas.nth(1)).toHaveValue("Hey, sorry I'm late.");

    // 1 つ目(見出しの "Corrected script")を削除し、5 文にする
    await page.getByRole("button", { name: "削除" }).first().click();
    await expect(textareas).toHaveCount(5);

    await page.getByRole("button", { name: "保存して音声を生成" }).click();
    await expect(page).toHaveURL(/#\/lesson\//);

    // デモモードでは即座に Natural が生成される(Learning は既定オフ)
    await expect(page.getByText("音声の生成が完了しました")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Natural 音声を生成します")).toBeVisible();
    await expect(page.getByText(/最初の文まで/)).toBeVisible();
    await expect(page.getByText(/1 \/ 5 文/)).toBeVisible();

    // 連続再生を止めて(1 文ずつ)、3 文目をタップして再生位置が移動する
    await page.getByRole("button", { name: /連続再生中/ }).click();
    await page.getByRole("button", { name: /^3/ }).first().click();
    await expect(page.getByText(/3 \/ 5 文/)).toBeVisible();

    // 苦手マーク
    await page.getByRole("button", { name: "苦手にマーク" }).click();
    await expect(page.getByText("苦手", { exact: true })).toBeVisible();

    // 速度は 3 段階
    await expect(page.getByRole("button", { name: "0.8×" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1.2×" })).toBeVisible();
    await expect(page.getByRole("button", { name: "0.7×" })).toHaveCount(0);
    await page.getByRole("button", { name: "0.8×" }).click();

    // 英文非表示: 現在文カードも一覧も英文を出さない(現在文 = 3 文目 "No worries.")
    await page.getByRole("button", { name: "英文を隠す" }).click();
    await expect(page.getByRole("button", { name: "英文を表示" })).toBeVisible();
    await expect(page.getByText("英文は非表示中")).toBeVisible();
    await expect(page.getByText("No worries.")).toHaveCount(0);
    await expect(page.getByText("Hey, sorry I'm late.")).toHaveCount(0);
    // 一時表示: タップで 3 秒だけ現在文が見える
    await page.getByRole("button", { name: "英文を 3 秒だけ表示" }).click();
    await expect(page.getByText("No worries.")).toBeVisible();
    await expect(page.getByText("英文は非表示中")).toBeVisible({ timeout: 6_000 });
    await page.getByRole("button", { name: "英文を表示" }).click();
    // 表示に戻すとカードと一覧の両方に英文が出る
    await expect(page.getByText("No worries.")).toHaveCount(2);

    // 一覧に戻り、再開位置が保存されている
    await page.getByRole("button", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText("音声あり")).toBeVisible();
    await expect(page.getByText("苦手 1")).toBeVisible();
    await expect(page.getByText("3/5 文目から再開")).toBeVisible();

    // 再読み込みしても教材が残る(IndexedDB)
    await page.reload();
    await expect(page.getByText("5 文", { exact: true })).toBeVisible();
    await expect(page.getByText("3/5 文目から再開")).toBeVisible();

    // データ管理に統計が出る(Natural のみなので音声は 5 件)
    await page.goto("/#/data");
    await expect(page.getByText(/1 件 \/ 5 文/)).toBeVisible();
    await expect(page.getByText(/5 件 ·/).first()).toBeVisible();
  });

  test("キャッシュ済み音声は再生成時に API を呼ばない", async ({ page }) => {
    await enableDemoMode(page);
    await page.goto("/#/new");
    await page.getByPlaceholder(/例:/).fill("Same sentence here.");
    await page.getByRole("button", { name: "分割して確認する" }).click();
    await page.getByRole("button", { name: "保存して音声を生成" }).click();
    await expect(page.getByText("音声の生成が完了しました")).toBeVisible({ timeout: 30_000 });

    // 同じ文で 2 つ目の教材を作ると全件キャッシュヒットになる
    await page.goto("/#/new");
    await page.getByPlaceholder(/例:/).fill("Same sentence here.");
    await page.getByRole("button", { name: "分割して確認する" }).click();
    await page.getByRole("button", { name: "保存して音声を生成" }).click();
    await expect(page.getByText("音声の生成が完了しました")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/キャッシュ再利用 1/)).toBeVisible();
  });

  test("Learning をオンにすると 2 種類生成される", async ({ page }) => {
    await enableDemoMode(page);
    await page.getByRole("checkbox").nth(1).check();
    await page.goto("/#/new");
    await page.getByPlaceholder(/例:/).fill("Learning variant on.");
    await page.getByRole("button", { name: "分割して確認する" }).click();
    await page.getByRole("button", { name: "保存して音声を生成" }).click();
    await expect(page.getByText("音声の生成が完了しました")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Natural / Learning の 2 種類を生成します")).toBeVisible();
  });
});
