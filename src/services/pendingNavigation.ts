let _pendingReturnDate: string | null = null;

export const setPendingReturnDate = (date: string) => { _pendingReturnDate = date; };
export const getPendingReturnDate = () => _pendingReturnDate;
export const clearPendingReturnDate = () => { _pendingReturnDate = null; };
