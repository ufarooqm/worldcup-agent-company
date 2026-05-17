import { expect, test } from '@playwright/test'

test('buyer can receive a confirmation card', async ({ page }) => {
  await page.request.post('/api/admin/rush', { data: { open: true } })
  await page.goto('/')
  await page.getByRole('button', { name: /buy ticket/i }).click()
  await expect(page.getByText(/confirmed|waitlisted/i)).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/^Seat$/)).toBeVisible()
})

test('dashboard can flip graph and orchestrator controls', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /^reset demo$/i }).click()
  await expect(page.getByText(/Three expert agents/)).toBeVisible()
  await expect(page.getByText(/Double-sold/)).toBeVisible()
  await expect(page.getByRole('button', { name: /turn graph on before load test/i })).toBeDisabled()
  await expect(page.getByRole('button', { name: /^ask$/i })).toBeEnabled()
  await page.getByRole('button', { name: /^graph$/i }).click()
  await expect(page.getByText(/The memory problem is fixed/)).toBeVisible()
  await page.getByRole('button', { name: 'Why is this price changing?' }).click()
  await expect(page.locator('.typing-line')).toBeVisible()
  await expect(page.locator('.typing-line')).not.toBeVisible({ timeout: 30000 })
  await expect(page.locator('.chat-message.user p')).toHaveText('Why is this price changing?')
  await page.getByRole('button', { name: /^orchestrated$/i }).click()
  await expect(page.getByText(/The orchestrator owns commits/)).toBeVisible()
  await page.getByRole('button', { name: /start live buying/i }).click()
  await expect(page.getByRole('button', { name: /close live buying/i })).toBeVisible()
})
