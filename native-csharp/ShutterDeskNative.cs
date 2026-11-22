using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace ShutterDeskNative
{
    public class MainForm : Form
    {
        private const int WM_HOTKEY = 0x0312;
        private const int HOTKEY_FULL = 1;
        private const int HOTKEY_REGION = 2;
        private const uint MOD_CONTROL = 0x0002;
        private const uint MOD_SHIFT = 0x0004;
        private const int SW_RESTORE = 9;

        private const string WINDOW_TITLE = "ShutterDesk 1.0.0";

        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        private readonly NotifyIcon _trayIcon;
        private readonly PictureBox _preview;
        private readonly Label _statusLabel;
        private readonly string _outputDir;

        public MainForm()
        {
            Text = WINDOW_TITLE;
            Width = 960;
            Height = 620;
            BackColor = Color.FromArgb(11, 14, 20);
            ForeColor = Color.FromArgb(241, 245, 249);
            StartPosition = FormStartPosition.CenterScreen;

            _outputDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
                "ShutterDesk"
            );
            Directory.CreateDirectory(_outputDir);

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 52,
                Padding = new Padding(12, 10, 12, 10),
                BackColor = Color.FromArgb(18, 23, 33)
            };

            var btnFull = CreateButton("Capture Full Screen (Ctrl+Shift+S)", true);
            btnFull.Click += (s, e) => CaptureFullScreen();

            var btnRegion = CreateButton("Capture Region (Ctrl+Shift+A)", false);
            btnRegion.Click += (s, e) => CaptureRegion();

            var btnOpen = CreateButton("Open Captures Folder", false);
            btnOpen.Click += (s, e) => System.Diagnostics.Process.Start("explorer.exe", _outputDir);

            toolbar.Controls.Add(btnFull);
            toolbar.Controls.Add(btnRegion);
            toolbar.Controls.Add(btnOpen);

            _preview = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.FromArgb(7, 10, 15)
            };

            _statusLabel = new Label
            {
                Dock = DockStyle.Bottom,
                Height = 30,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(12, 0, 12, 0),
                BackColor = Color.FromArgb(18, 23, 33),
                ForeColor = Color.FromArgb(148, 163, 184),
                Text = "Ready — Saving PNGs to " + _outputDir
            };

            Controls.Add(_preview);
            Controls.Add(toolbar);
            Controls.Add(_statusLabel);

            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "ShutterDesk",
                Visible = true
            };
            _trayIcon.Click += (s, e) => { Show(); WindowState = FormWindowState.Normal; Activate(); };
            _trayIcon.DoubleClick += (s, e) => { Show(); WindowState = FormWindowState.Normal; Activate(); };

            var menu = new ContextMenuStrip();
            menu.Items.Add("Open ShutterDesk", null, (s, e) => { Show(); WindowState = FormWindowState.Normal; Activate(); });
            menu.Items.Add("Capture Full Screen", null, (s, e) => CaptureFullScreen());
            menu.Items.Add("Capture Region", null, (s, e) => CaptureRegion());
            menu.Items.Add("Open Folder", null, (s, e) => System.Diagnostics.Process.Start("explorer.exe", _outputDir));
            menu.Items.Add("Exit", null, (s, e) => { _trayIcon.Visible = false; Application.Exit(); });
            _trayIcon.ContextMenuStrip = menu;

            Load += (s, e) =>
            {
                RegisterHotKey(Handle, HOTKEY_FULL, MOD_CONTROL | MOD_SHIFT, (uint)Keys.S);
                RegisterHotKey(Handle, HOTKEY_REGION, MOD_CONTROL | MOD_SHIFT, (uint)Keys.A);
            };

            FormClosing += (s, e) =>
            {
                UnregisterHotKey(Handle, HOTKEY_FULL);
                UnregisterHotKey(Handle, HOTKEY_REGION);
                _trayIcon.Visible = false;
            };
        }

        private Button CreateButton(string text, bool primary)
        {
            return new Button
            {
                Text = text,
                AutoSize = true,
                FlatStyle = FlatStyle.Flat,
                BackColor = primary ? Color.FromArgb(37, 99, 235) : Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                Padding = new Padding(10, 4, 10, 4),
                Margin = new Padding(0, 0, 8, 0)
            };
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY)
            {
                int id = m.WParam.ToInt32();
                if (id == HOTKEY_FULL) CaptureFullScreen();
                if (id == HOTKEY_REGION) CaptureRegion();
            }
            base.WndProc(ref m);
        }

        private void CaptureFullScreen()
        {
            Hide();
            Thread.Sleep(220);
            Rectangle bounds = SystemInformation.VirtualScreen;
            using (var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                SaveAndDisplay(bmp);
            }
            Show();
            Activate();
        }

        private void CaptureRegion()
        {
            Hide();
            Thread.Sleep(220);
            using (var snip = new RegionSnipOverlay())
            {
                if (snip.ShowDialog() == DialogResult.OK && snip.SelectedRect.Width > 4 && snip.SelectedRect.Height > 4)
                {
                    Rectangle r = snip.SelectedRect;
                    using (var bmp = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb))
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.CopyFromScreen(r.Left, r.Top, 0, 0, r.Size, CopyPixelOperation.SourceCopy);
                        SaveAndDisplay(bmp);
                    }
                }
            }
            Show();
            Activate();
        }

        private void SaveAndDisplay(Bitmap bmp)
        {
            string file = Path.Combine(_outputDir, "capture-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png");
            bmp.Save(file, ImageFormat.Png);
            Clipboard.SetImage(bmp);
            _preview.Image?.Dispose();
            _preview.Image = new Bitmap(bmp);
            _statusLabel.Text = "Saved: " + file + " (copied to clipboard)";
        }

        [STAThread]
        public static void Main()
        {
            bool createdNew;
            using (var mutex = new Mutex(true, "Global\com.shutterdesk.capture", out createdNew))
            {
                if (!createdNew)
                {
                    IntPtr existing = FindWindow(null, WINDOW_TITLE);
                    if (existing != IntPtr.Zero)
                    {
                        ShowWindow(existing, SW_RESTORE);
                        SetForegroundWindow(existing);
                    }
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }

    public class RegionSnipOverlay : Form
    {
        private Point _start;
        private Rectangle _rect;
        private bool _dragging;
        public Rectangle SelectedRect => _rect;

        public RegionSnipOverlay()
        {
            FormBorderStyle = FormBorderStyle.None;
            Bounds = SystemInformation.VirtualScreen;
            TopMost = true;
            BackColor = Color.Black;
            Opacity = 0.28;
            Cursor = Cursors.Cross;
            DoubleBuffered = true;

            KeyDown += (s, e) => { if (e.KeyCode == Keys.Escape) DialogResult = DialogResult.Cancel; };
            MouseDown += (s, e) => { _dragging = true; _start = e.Location; _rect = new Rectangle(e.Location, Size.Empty); };
            MouseMove += (s, e) =>
            {
                if (!_dragging) return;
                _rect = new Rectangle(
                    Math.Min(_start.X, e.X),
                    Math.Min(_start.Y, e.Y),
                    Math.Abs(e.X - _start.X),
                    Math.Abs(e.Y - _start.Y)
                );
                Invalidate();
            };
            MouseUp += (s, e) =>
            {
                _dragging = false;
                DialogResult = DialogResult.OK;
            };
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            if (_rect.Width > 0 && _rect.Height > 0)
            {
                using (var pen = new Pen(Color.FromArgb(59, 130, 246), 2))
                {
                    e.Graphics.DrawRectangle(pen, _rect);
                }
            }
        }
    }
}
