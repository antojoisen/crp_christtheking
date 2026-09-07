# Christ the King Catechism Savings

Mobile-first React/Vite application for the Christ the King Church Catechism Savings system.

## Current stage
- Supabase authentication foundation
- Current-batch participant dashboard
- Participant history
- Sunday collection entry
- Permission-aware viewing and collection controls
- Existing-entry editing requires `crp.edit_contributions`
- New entries require `crp.add_contributions`
- Current-year viewing requires `crp.view_current_year`
- Admin accounts bypass CRP permission checks through the existing authorization model.

## Supabase
Uses the existing project `cfrcmchxfoojhlglmbrf`.

Create `.env.local` from `.env.example` and supply the project's publishable key. Do not commit `.env.local` or service-role credentials.

## Local run
```bash
npm install
npm run dev
```

## Cloudflare Pages
Set the project root directory to `catechism-savings`, build command to `npm run build`, and output directory to `dist`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Pages environment variables.
