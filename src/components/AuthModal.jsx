// Kirish / Ro'yxatdan o'tish oynasi. Muvaffaqiyatdan keyin kutilayotgan amal davom etadi.
import { useState } from 'react';
import AuthForm from './AuthForm.jsx';
import Modal from './Modal.jsx';

export default function AuthModal({ reason, onClose, onSuccess }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Xush kelibsiz!" subtitle="Hasharchilar jamoasiga qo'shiling" onClose={busy ? () => {} : onClose} size="sm">
      <AuthForm reason={reason} onSuccess={onSuccess} busyChange={setBusy} />
    </Modal>
  );
}
