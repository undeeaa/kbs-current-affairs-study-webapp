import "./styles.css";
import { StudyApp } from "./study-app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) throw new Error("앱을 표시할 영역을 찾지 못했습니다.");

const app = new StudyApp(root);
void app.start();
