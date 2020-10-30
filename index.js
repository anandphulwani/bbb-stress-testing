// load in puppeteer
const { exit } = require('process')
const puppeteer = require('puppeteer')
const os = require("os");

// load config variables from file
const config = require('./config.js');

const line_break = ("=").repeat(50);

// read rooms and perBrowserTabs from config file
const rooms = config.rooms
const tabsPerBrowserWindow = config.tabs_per_browser_window

// validate arguments of command line and read them into variable
var myArgs = process.argv.slice(2);
if ( myArgs.length != 1 || !(parseInt(myArgs[0], 10)) ||  !(parseInt(myArgs[0]) < 15) ) {
  console.log("Command should be in format 'node index.js 10'")
  console.log("Argument required: 'No Of Users In Every Room'")
  console.log("                  Argument should be one only'")
  console.log("                  Argument should be numeric")
  console.log("                  Argument should be less than 15")
  exit(0)
}
const noOfUsersInRoom = parseInt(myArgs[0])

// Create a name prefix of user to identify uniquely
const hostnameRandom = (Math.floor(Math.random() * 100))+"_"+os.hostname();
console.log("Name Prefix: "+hostnameRandom)

// this wrapper means immediately execute this code
void (async () => {
  // wrapper to catch errors
  try {
    let browser, page, url;
    let browserArr = []
    // loop the outer rooms array
    for (let cnt = 0; cnt < (rooms.length * noOfUsersInRoom); cnt++) {
      roomCnt = cnt % rooms.length
      url = new URL(rooms[roomCnt][0]);

      if (cnt % tabsPerBrowserWindow == 0) {
        // create a new browser instance
        browser = await puppeteer.launch({headless: config.isHeadless, devtools: true, args: [ 
                        '--no-sandbox', '--disable-setuid-sandbox',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--window-size=1200,800'
                      ] });

        browserArr.push(browser);

        // allow microphone permissions automatically
        const context = browser.defaultBrowserContext();
        context.clearPermissionOverrides();
        context.overridePermissions(url.origin, ['microphone']);

        // create a page inside the browser
        page = (await browser.pages())[0]; //await browser.newPage()
        // set viewport for the autoscroll function
        /*await page.setViewport({
          width: 1200,
          height: 800
        });*/
      } else {
        // create new tab is tabs per browser window limit is not reached
        page = await browser.newPage()
      }

      const session = await page.target().createCDPSession();
      await session.send('Page.enable');
      await session.send('Page.setWebLifecycleState', {state: 'active'});

      //navigate to room url's page
      await page.goto(url.href, { waitUntil: 'networkidle0' })
      
      // Wait for footer element with class 'footer' to load
      await page.waitForSelector("footer.footer");

      await page.waitFor(config.wait_after_pageload);

      // Get "I Agree" button to save cookies. 
      const cookieAgreeButton = await page.$('button[id="cookies-agree-button"]');

      // Compare whether the button exists or not, if it exists click the button.
      if (cookieAgreeButton != null) {
        await cookieAgreeButton.click();
      }

      // Enter room access code in the input box
      await page.$eval('input[id="room_access_code"]', (el, value) => el.value = value, rooms[roomCnt][1]);

      // Click the enter Button
      let enterButton = await page.$('input[type="submit"][name="commit"][value="Enter"]');
      await enterButton.click();
      
      // Wait until no more than 2 requests are sent over network
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      // Enter the user's name along with the counter
      await page.$eval('input[class="form-control join-form"][required="required"][placeholder="Enter your name!"]', 
                    (el, value) => el.value = value, hostnameRandom+"-"+(cnt+1));

      // Click the room join button
      enterButton = await page.$('button[type="submit"][id="room-join"]');
      await enterButton.click();

      // Wait until no more than 2 requests are sent over network
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      // Wait for "Listen only" label to show up
      await page.waitForSelector('button[aria-label="Listen only"][aria-disabled="false"]');
      
      // Click on "Listen only" button
      const listenOnlyButton = await page.$('button[aria-label="Listen only"][aria-disabled="false"]');
      await listenOnlyButton.click();
    }
    console.log(browserArr.length)
    await page.waitFor( 6 * 60 * 60 * 1000 );
    await browser.close()
  } catch (error) {
    // if something goes wrong
    // display the error message in console
    console.log(error)
  }
})()