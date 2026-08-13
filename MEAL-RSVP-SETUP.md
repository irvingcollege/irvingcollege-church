# Wednesday Meal RSVP setup

## Pages

- Public RSVP: `https://irvingcollege.church/meal`
- Private totals: `https://irvingcollege.church/meal-results`
- QR code image: `/public/images/meal-rsvp-qr.svg`

## Required Netlify setting

Before using the private results page, add an environment variable in Netlify:

1. Open the Irving College Baptist Church project in Netlify.
2. Go to **Project configuration → Environment variables**.
3. Add a variable named `MEAL_RESULTS_PASSWORD`.
4. Enter the private password church leadership will use.
5. Save it and redeploy the site.

Do not put the password in this project or commit it to GitHub.

## Weekly behavior

- RSVPs close at Tuesday noon, Central Time.
- At Tuesday noon, the form automatically begins accepting responses for the following Wednesday.
- Each week's responses are stored separately; no manual reset is needed.
- Submitting the same family name again updates that family's response for the active week.
- The private page shows total meals, families eating, families not eating, and a printable family list.

## QR code

The included QR code points to `https://irvingcollege.church/meal`. It can be placed on slides, table signs, bulletin inserts, or social graphics.
