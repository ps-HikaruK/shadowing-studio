import { HashRouter, Route, Routes } from "react-router-dom";
import { LessonListPage } from "@/features/lesson-list/LessonListPage";
import { ImportPage } from "@/features/lesson-editor/ImportPage";
import { EditLessonPage } from "@/features/lesson-editor/EditLessonPage";
import { PlayerPage } from "@/features/player/PlayerPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { DataPage } from "@/features/data/DataPage";
import { ToastHost } from "@/components/Toast";
import { ConfirmDialogHost } from "@/components/ConfirmDialog";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LessonListPage />} />
        <Route path="/new" element={<ImportPage />} />
        <Route path="/lesson/:id" element={<PlayerPage />} />
        <Route path="/lesson/:id/edit" element={<EditLessonPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="*" element={<LessonListPage />} />
      </Routes>
      <ToastHost />
      <ConfirmDialogHost />
    </HashRouter>
  );
}
