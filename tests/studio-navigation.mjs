export async function openPractice(page) {
  if (await page.locator('#home-screen').isVisible()) return;
  await page.locator('[data-tab=home]').click();
}

export async function selectActivity(page, activity) {
  await openPractice(page);
  const selector = activity === 'quiz' ? '[data-quiz-mode=notes]' : `[data-activity="${activity}"]`;
  await page.locator('.activity-card'+selector).click();
}

export async function openTrainingHistory(page) {
  await page.locator('[data-tab=progress]').click();
  await page.locator('#progress-full-history').click();
}

export async function openLastTrainingReport(page) {
  await page.locator('[data-tab=progress]').click();
  await page.locator('[data-training-report]').first().click();
}
