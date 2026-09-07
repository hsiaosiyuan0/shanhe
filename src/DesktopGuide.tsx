import { ArrowUpRight, Download, MapPin, Monitor, Sparkles } from 'lucide-react';
import { Button, Dialog } from './ui';

export default function DesktopGuide({
  onClose,
  onExport,
  canExport,
}: {
  onClose: () => void;
  onExport: () => void;
  canExport: boolean;
}) {
  return (
    <Dialog
      title="在桌面上，继续探索"
      description="连接本机 Codex 或模型 API，让 AI 陪你读故事、标记山川、补充人生足迹。"
      onClose={onClose}
    >
      <div className="desktop-guide">
        <div className="desktop-guide-feature">
          <span className="desktop-guide-icon">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>一句好奇，添一笔山河</strong>
            <p>对话与地图一起变化，故事和探索结果保存在你的电脑。</p>
          </div>
        </div>
        <ol className="desktop-guide-steps">
          <li>
            <span>01</span>
            <div>
              <strong>安装山河桌面版</strong>
              <p>当前支持 macOS，安装指引提供源码构建步骤。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>带上正在读的故事</strong>
              <p>导出当前故事，在桌面版点击「导入故事」。已有对话也会一并保留。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>连接你的探索助手</strong>
              <p>在「模型设置」中复用 Codex 登录，或连接模型 API，继续探索。</p>
            </div>
          </li>
        </ol>
        <div className="desktop-guide-actions">
          <a
            className="primary-button desktop-guide-install"
            href="https://github.com/hsiaosiyuan0/shanhe/blob/main/docs/DESKTOP.md"
            target="_blank"
            rel="noreferrer"
          >
            <Monitor size={17} aria-hidden="true" />
            查看 macOS 安装步骤
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <Button className="desktop-guide-export" onClick={onExport} disabled={!canExport}>
            <Download size={16} aria-hidden="true" />
            导出当前故事
          </Button>
        </div>
        <p className="desktop-guide-note">
          <MapPin size={14} aria-hidden="true" />
          在线版可继续浏览地图、编辑事件、保存快照。
        </p>
      </div>
    </Dialog>
  );
}
