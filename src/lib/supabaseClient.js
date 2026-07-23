import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://sqrvzifqpipocfvofzro.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxcnZ6aWZxcGlwb2Nmdm9menJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MjU2NTMsImV4cCI6MjEwMDQwMTY1M30.wspB0b7bsv8bQBpbuJ_Eof67Ywkf-DWaMsAsEpxbyRU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
