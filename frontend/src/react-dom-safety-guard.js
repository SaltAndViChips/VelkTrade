/*
  React DOM safety guard.

  VelkTrade has carried several legacy enhancement scripts that used to mutate
  React-owned inventory cards. Even after removing those scripts, users can still
  have old cached chunks or third-party extension mutations that leave React with
  a stale parent/child relationship during deletes.

  This guard prevents a stale removeChild/insertBefore mismatch from crashing the
  entire app. It is intentionally conservative: it only intercepts the exact
  mismatch case where the target node is not a child of the requested parent.
*/

function installReactDomSafetyGuard() {
  if (typeof window === 'undefined' || typeof Node === 'undefined') return;
  if (window.__VELKTRADE_REACT_DOM_SAFETY_GUARD__) return;
  window.__VELKTRADE_REACT_DOM_SAFETY_GUARD__ = true;

  const originalRemoveChild = Node.prototype.removeChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalReplaceChild = Node.prototype.replaceChild;

  Node.prototype.removeChild = function safeRemoveChild(child) {
    if (child && child.parentNode !== this) {
      try {
        if (child.parentNode) return originalRemoveChild.call(child.parentNode, child);
      } catch {}
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  Node.prototype.insertBefore = function safeInsertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };

  Node.prototype.replaceChild = function safeReplaceChild(newChild, oldChild) {
    if (oldChild && oldChild.parentNode !== this) {
      try {
        if (oldChild.parentNode) originalRemoveChild.call(oldChild.parentNode, oldChild);
      } catch {}
      return originalInsertBefore.call(this, newChild, null);
    }
    return originalReplaceChild.call(this, newChild, oldChild);
  };
}

installReactDomSafetyGuard();
