const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 400, height: 800 }
  });
  const page = await context.newPage();
  
  // Navigate to login
  await page.goto('http://localhost:3000/index.html');
  
  // Fill in login
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button:has-text("Sign In")');
  
  // Wait for navigation to dashboard
  await page.waitForURL('**/dashboard.html');
  console.log('Logged in successfully, current URL:', page.url());
  
  // Take screenshot before click
  await page.screenshot({ path: 'scratch/before_click.png' });
  
  // Click hamburger menu
  // The hamburger menu button has class mobile-menu-btn and is in the topbar
  await page.click('.topbar .mobile-menu-btn');
  console.log('Clicked hamburger menu');
  
  // Wait 1 second for slide-in animation
  await page.waitForTimeout(1000);
  
  // Take screenshot after click
  await page.screenshot({ path: 'scratch/after_click.png' });
  
  // Get outerHTML of .sidebar
  const sidebarHTML = await page.evaluate(() => {
    const el = document.querySelector('.sidebar');
    return el ? el.outerHTML : 'NOT FOUND';
  });
  console.log('Sidebar outerHTML:', sidebarHTML.substring(0, 500) + '...');
  
  // Get computed styles of .sidebar
  const sidebarStyles = await page.evaluate(() => {
    const el = document.querySelector('.sidebar');
    if (!el) return 'NOT FOUND';
    const s = window.getComputedStyle(el);
    return {
      display: s.display,
      width: s.width,
      height: s.height,
      left: s.left,
      visibility: s.visibility,
      opacity: s.opacity,
      zIndex: s.zIndex,
      backgroundColor: s.backgroundColor
    };
  });
  console.log('Sidebar styles:', sidebarStyles);
  
  // Get computed styles of .sidebar-nav
  const navStyles = await page.evaluate(() => {
    const el = document.querySelector('.sidebar-nav');
    if (!el) return 'NOT FOUND';
    const s = window.getComputedStyle(el);
    return {
      display: s.display,
      width: s.width,
      height: s.height,
      visibility: s.visibility,
      opacity: s.opacity
    };
  });
  console.log('Sidebar Nav styles:', navStyles);

  await browser.close();
})();
