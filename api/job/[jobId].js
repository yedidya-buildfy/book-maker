// This endpoint handles job status requests
// The jobs Map is shared across the generate.js file

export default async function handler(req, res) {
  const { jobId } = req.query;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // For now, return a placeholder response
  // In a real implementation, you'd need to share the jobs Map across files
  // or use a database/external storage
  
  return res.json({
    id: jobId,
    status: 'pending',
    progress: 0,
    currentPhase: 'Waiting...'
  });
}
