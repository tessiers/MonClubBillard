const SUPABASE_URL = "https://iwtuwtvgrocmxfkmidlk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHV3dHZncm9jbXhma21pZGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTM5NzUsImV4cCI6MjA5MzkyOTk3NX0.ISCfQxrD4dAnygL-teYon-KoJWrzDuTEHFZpe9tslmY";

async function run() {
  const email = 'zizou41220@gmail.com';
  
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };

  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=*,subscriptions(*)`, { headers });
  const profile = await res1.json();
  console.log('Profiles data:', JSON.stringify(profile, null, 2));

  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/imported_members?email=eq.${encodeURIComponent(email)}`, { headers });
  const imported = await res2.json();
  console.log('Imported data:', JSON.stringify(imported, null, 2));
}

run();
