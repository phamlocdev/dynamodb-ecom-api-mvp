exports.handler = async (event, _context, callback) => {
  const request = event.Records[0].cf.request
  const uri = request.uri || '/'

  console.log(`[Lambda Rewrite Handler] Received request URI: ${uri}`)

  if (uri === '/') {
    request.uri = '/index.html'
    logRewrite(uri, request.uri, 'home')
    return callback(null, request)
  }

  if (uri.startsWith('/_next/') || uri.includes('.') || uri.endsWith('/index.html')) {
    logRewrite(uri, request.uri, 'pass-through')
    return callback(null, request)
  }

  const normalized = uri.endsWith('/') && uri.length > 1 ? uri.slice(0, -1) : uri
  if (normalized !== uri) {
    console.log(`[Lambda Rewrite Handler] Normalized URI from ${uri} to ${normalized}`)
  }

  if (/^\/products\/[^/]+$/.test(normalized)) {
    const productId = normalized.split('/')[2]
    request.uri =
      productId === '__fallback' || productId === '__template'
        ? `${normalized}/index.html`
        : `/products/${productId}/index.html`
    logRewrite(uri, request.uri, `product detail productId=${productId}`)
    return callback(null, request)
  }

  if (normalized === '/orders/payment-return') {
    request.uri = '/orders/payment-return/index.html'
    logRewrite(uri, request.uri, 'payment return static route')
    return callback(null, request)
  }

  if (/^\/orders\/[^/]+$/.test(normalized)) {
    request.uri = '/orders/__fallback/index.html'
    logRewrite(uri, request.uri, 'order detail fallback')
    return callback(null, request)
  }

  if (/^\/admin\/orders\/[^/]+$/.test(normalized)) {
    request.uri = '/admin/orders/__fallback/index.html'
    logRewrite(uri, request.uri, 'admin order detail fallback')
    return callback(null, request)
  }

  if (/^\/admin\/products\/[^/]+\/edit$/.test(normalized)) {
    request.uri = '/admin/products/__fallback/edit/index.html'
    logRewrite(uri, request.uri, 'admin product edit fallback')
    return callback(null, request)
  }

  if (/^\/admin\/users\/[^/]+\/access$/.test(normalized)) {
    request.uri = '/admin/users/__fallback/access/index.html'
    logRewrite(uri, request.uri, 'admin user access fallback')
    return callback(null, request)
  }

  request.uri = `${normalized}/index.html`
  logRewrite(uri, request.uri, 'static route fallback')
  return callback(null, request)
}

function logRewrite(originalUri, rewrittenUri, reason) {
  console.log(`[Lambda Rewrite Handler] ${reason}: ${originalUri} -> ${rewrittenUri}`)
}
