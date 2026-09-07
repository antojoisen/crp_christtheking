import { supabase } from './supabase'

export async function getCurrentBatch() {
  const { data, error } = await supabase.from('crp_batches').select('id,year,name,is_current').eq('is_current', true).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No current catechism batch has been configured.')
  return data
}

export async function getParticipants(batchId) {
  const { data, error } = await supabase.from('crp_participants').select('id,name,active').eq('batch_id', batchId).eq('active', true).order('name')
  if (error) throw error
  return data ?? []
}

export async function getContributions(batchId) {
  const { data, error } = await supabase.from('crp_contributions').select('id,participant_id,contribution_date,amount').eq('batch_id', batchId).order('contribution_date').order('participant_id')
  if (error) throw error
  return data ?? []
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('id,full_name,role,active').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function getMyPermissions(userId) {
  const { data, error } = await supabase.from('profile_permissions').select('permission').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).map(x => x.permission)
}

export async function saveSundayCollection({ batchId, date, entries, userId }) {
  const rows = entries.filter(e => Number(e.amount) > 0).map(e => ({
    batch_id: batchId,
    participant_id: e.participant_id,
    contribution_date: date,
    amount: Number(e.amount),
    created_by: userId,
  }))
  if (!rows.length) return { inserted: 0 }

  const { data, error } = await supabase.from('crp_contributions').upsert(rows, { onConflict: 'participant_id,contribution_date' }).select('id')
  if (error) throw error
  return { inserted: data?.length ?? rows.length }
}
