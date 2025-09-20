export async function GET() {
  console.log('[TEST] Test endpoint called');
  return Response.json({
    message: 'Test endpoint working',
    timestamp: new Date().toISOString()
  });
}