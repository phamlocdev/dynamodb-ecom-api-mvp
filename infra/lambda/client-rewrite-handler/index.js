exports.handler = async (event, _context, callback) => {
  const request = event.Records[0].cf.request
  const uri = request.uri || '/'

  if (uri === '/') {
    request.uri = '/index.html'
    return callback(null, request)
  }

  if (uri.startsWith('/_next/') || uri.includes('.') || uri.endsWith('/index.html')) {
    return callback(null, request)
  }

  const normalized = uri.endsWith('/') && uri.length > 1 ? uri.slice(0, -1) : uri

  if (/^\/products\/[^/]+$/.test(normalized)) {
    const productId = normalized.split('/')[2]
    request.uri =
      productId === '__fallback' || productId === '__template'
        ? `${normalized}/index.html`
        : `/products/${productId}/index.html`
    return callback(null, request)
  }

  if (/^\/orders\/[^/]+$/.test(normalized)) {
    request.uri = '/orders/__fallback/index.html'
    return callback(null, request)
  }

  if (/^\/admin\/orders\/[^/]+$/.test(normalized)) {
    request.uri = '/admin/orders/__fallback/index.html'
    return callback(null, request)
  }

  if (/^\/admin\/products\/[^/]+\/edit$/.test(normalized)) {
    request.uri = '/admin/products/__fallback/edit/index.html'
    return callback(null, request)
  }

  if (/^\/admin\/users\/[^/]+\/access$/.test(normalized)) {
    request.uri = '/admin/users/__fallback/access/index.html'
    return callback(null, request)
  }

  request.uri = `${normalized}/index.html`
  return callback(null, request)
}
