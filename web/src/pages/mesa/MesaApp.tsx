import { Route, Routes } from 'react-router-dom';
import Console from './Console';
import MesaHome from './MesaHome';

/** Área do mesário: /mesa (meus jogos) e /mesa/jogo/:id (console). */
export default function MesaApp() {
  return (
    <Routes>
      <Route index element={<MesaHome />} />
      <Route path="jogo/:id" element={<Console />} />
      <Route path="*" element={<MesaHome />} />
    </Routes>
  );
}
