export function normalizePurchase(p) {
  const item = p.itemType === 'course' ? p.courseId : p.bookId;
  const safeItem = item || {};
  return {
    id: p._id,
    itemId: safeItem._id || (typeof item === 'string' ? item : undefined),
    itemType: p.itemType || 'book',
    title: safeItem.title || 'Untitled',
    author: safeItem.author || '',
    price: p.amount ? p.amount / 100 : safeItem.price || 0,
    status: p.status || p.paymentState || 'PENDING',
    purchasedAt: p.purchasedAt || p.createdAt,
    downloadToken: p.downloadToken,
    refundRequested: !!p.refundRequested,
  };
}
