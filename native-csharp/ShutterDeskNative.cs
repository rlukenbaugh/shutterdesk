// ShutterDesk native edition: a small WinForms screenshot tool.
//
// This file must compile with the C# compiler that ships with Windows itself
// (%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe), which only understands C# 5.
// So: no "=>" properties, no "?." operator, no $"..." strings, no nameof().
// CI checks this with the real csc.exe on Windows.
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
        private const uint MOD_NOREPEAT = 0x4000;
        private const int SW_RESTORE = 9;

        private const string WINDOW_TITLE = "ShutterDesk";

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        // Without this, Windows scales the app at 125%/150% display scaling and the
        // screen size it reports is too small, so captures were cropped or blurry.
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        private readonly NotifyIcon _trayIcon;
        private readonly PictureBox _preview;
        private readonly Label _statusLabel;
        private readonly string _outputDir;
        private bool _busy;

        public MainForm()
        {
            Text = WINDOW_TITLE;
            Width = 960;
            Height = 620;
            MinimumSize = new Size(640, 420);
            BackColor = Color.FromArgb(11, 14, 20);
            ForeColor = Color.FromArgb(241, 245, 249);
            StartPosition = FormStartPosition.CenterScreen;
            Icon appIcon = LoadAppIcon();
            Icon = appIcon;

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
            btnFull.Click += delegate { CaptureFullScreen(); };

            var btnRegion = CreateButton("Capture Region (Ctrl+Shift+A)", false);
            btnRegion.Click += delegate { CaptureRegion(); };

            var btnOpen = CreateButton("Open Captures Folder", false);
            btnOpen.Click += delegate { OpenOutputFolder(); };

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
                Text = "Ready. Captures are saved as PNG in " + _outputDir + " and copied to the clipboard."
            };

            Controls.Add(_preview);
            Controls.Add(toolbar);
            Controls.Add(_statusLabel);

            _trayIcon = new NotifyIcon
            {
                Icon = appIcon,
                Text = "ShutterDesk",
                Visible = true
            };
            _trayIcon.DoubleClick += delegate { RestoreFromTray(); };
            _trayIcon.MouseClick += delegate(object s, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left) RestoreFromTray();
            };

            var menu = new ContextMenuStrip();
            menu.Items.Add("Open ShutterDesk", null, delegate { RestoreFromTray(); });
            menu.Items.Add("Capture Full Screen", null, delegate { CaptureFullScreen(); });
            menu.Items.Add("Capture Region", null, delegate { CaptureRegion(); });
            menu.Items.Add("Open Captures Folder", null, delegate { OpenOutputFolder(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, delegate { _trayIcon.Visible = false; Application.Exit(); });
            _trayIcon.ContextMenuStrip = menu;

            Load += delegate
            {
                var failed = new System.Collections.Generic.List<string>();
                if (!RegisterHotKey(Handle, HOTKEY_FULL, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (uint)Keys.S))
                    failed.Add("Ctrl+Shift+S");
                if (!RegisterHotKey(Handle, HOTKEY_REGION, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, (uint)Keys.A))
                    failed.Add("Ctrl+Shift+A");
                if (failed.Count > 0)
                {
                    SetStatus("Another program is already using " + string.Join(" and ", failed.ToArray()) +
                              ". Use the buttons or the tray menu instead.");
                }
            };

            FormClosing += delegate
            {
                UnregisterHotKey(Handle, HOTKEY_FULL);
                UnregisterHotKey(Handle, HOTKEY_REGION);
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            };
        }

        private static Icon LoadAppIcon()
        {
            // The installer embeds assets\icon.ico into the exe with /win32icon.
            try
            {
                Icon icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (icon != null) return icon;
            }
            catch (Exception)
            {
            }
            return SystemIcons.Application;
        }

        private Button CreateButton(string text, bool primary)
        {
            var button = new Button
            {
                Text = text,
                AutoSize = true,
                FlatStyle = FlatStyle.Flat,
                BackColor = primary ? Color.FromArgb(37, 99, 235) : Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                Padding = new Padding(10, 4, 10, 4),
                Margin = new Padding(0, 0, 8, 0)
            };
            button.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            return button;
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

        private void RestoreFromTray()
        {
            Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate();
        }

        private void OpenOutputFolder()
        {
            try
            {
                Directory.CreateDirectory(_outputDir);
                System.Diagnostics.Process.Start("explorer.exe", "\"" + _outputDir + "\"");
            }
            catch (Exception ex)
            {
                SetStatus("Could not open the captures folder: " + ex.Message);
            }
        }

        private void SetStatus(string text)
        {
            _statusLabel.Text = text;
        }

        /// <summary>Hides ShutterDesk and grabs every monitor as one bitmap.</summary>
        private Bitmap GrabVirtualScreen(out Rectangle bounds)
        {
            if (Visible) Hide();
            // Give Windows time to repaint what was under the window.
            Application.DoEvents();
            Thread.Sleep(250);

            bounds = SystemInformation.VirtualScreen;
            var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
            }
            return bmp;
        }

        private void CaptureFullScreen()
        {
            if (_busy) return;
            _busy = true;
            try
            {
                Rectangle bounds;
                using (Bitmap bmp = GrabVirtualScreen(out bounds))
                {
                    SaveAndDisplay(bmp);
                }
            }
            catch (Exception ex)
            {
                SetStatus("Capture failed: " + ex.Message);
            }
            finally
            {
                RestoreFromTray();
                _busy = false;
            }
        }

        private void CaptureRegion()
        {
            if (_busy) return;
            _busy = true;
            try
            {
                Rectangle bounds;
                // Freeze the screen first and let the user select on that picture. The old
                // version copied the screen after the dimmed overlay closed, using overlay
                // coordinates as screen coordinates, which was wrong whenever a monitor sits
                // left of or above the main one.
                using (Bitmap frozen = GrabVirtualScreen(out bounds))
                using (var snip = new RegionSnipOverlay(frozen, bounds))
                {
                    if (snip.ShowDialog() == DialogResult.OK && snip.SelectedRect.Width > 4 && snip.SelectedRect.Height > 4)
                    {
                        using (Bitmap crop = frozen.Clone(snip.SelectedRect, PixelFormat.Format32bppArgb))
                        {
                            SaveAndDisplay(crop);
                        }
                    }
                    else
                    {
                        SetStatus("Region capture cancelled.");
                    }
                }
            }
            catch (Exception ex)
            {
                SetStatus("Capture failed: " + ex.Message);
            }
            finally
            {
                RestoreFromTray();
                _busy = false;
            }
        }

        private void SaveAndDisplay(Bitmap bmp)
        {
            Directory.CreateDirectory(_outputDir);
            string file = Path.Combine(_outputDir, "capture-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".png");
            bmp.Save(file, ImageFormat.Png);

            string clipboardNote = " (copied to clipboard)";
            try
            {
                Clipboard.SetImage(bmp);
            }
            catch (ExternalException)
            {
                // Another program has the clipboard open. The file is saved either way.
                clipboardNote = " (clipboard was busy, not copied)";
            }

            Image old = _preview.Image;
            _preview.Image = new Bitmap(bmp);
            if (old != null) old.Dispose();
            SetStatus("Saved: " + file + clipboardNote);
        }

        [STAThread]
        public static void Main()
        {
            SetProcessDPIAware();

            bool createdNew;
            // "Local\" = one instance per signed-in user. (The old "Global\c..." string was an
            // invalid C# escape sequence and stopped the file from compiling at all.)
            using (var mutex = new Mutex(true, @"Local\com.shutterdesk.capture", out createdNew))
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
                GC.KeepAlive(mutex);
            }
        }
    }

    /// <summary>
    /// Full-screen overlay showing a frozen, dimmed picture of every monitor. Drag to select;
    /// Esc or right-click cancels. SelectedRect is in the frozen bitmap's coordinates.
    /// </summary>
    public class RegionSnipOverlay : Form
    {
        private readonly Bitmap _frozen;
        private Point _start;
        private Rectangle _rect;
        private bool _dragging;

        public Rectangle SelectedRect
        {
            get { return _rect; }
        }

        public RegionSnipOverlay(Bitmap frozen, Rectangle virtualBounds)
        {
            _frozen = frozen;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            Bounds = virtualBounds;
            TopMost = true;
            ShowInTaskbar = false;
            KeyPreview = true;
            Cursor = Cursors.Cross;
            DoubleBuffered = true;

            KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape) DialogResult = DialogResult.Cancel;
            };
            MouseDown += delegate(object s, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Right)
                {
                    DialogResult = DialogResult.Cancel;
                    return;
                }
                _dragging = true;
                _start = e.Location;
                _rect = new Rectangle(e.Location, Size.Empty);
            };
            MouseMove += delegate(object s, MouseEventArgs e)
            {
                if (!_dragging) return;
                _rect = Rectangle.FromLTRB(
                    Math.Min(_start.X, e.X), Math.Min(_start.Y, e.Y),
                    Math.Max(_start.X, e.X), Math.Max(_start.Y, e.Y));
                _rect.Intersect(new Rectangle(Point.Empty, _frozen.Size));
                Invalidate();
            };
            MouseUp += delegate(object s, MouseEventArgs e)
            {
                if (!_dragging) return;
                _dragging = false;
                DialogResult = DialogResult.OK;
            };
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Activate();
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            // Everything is drawn in OnPaint; skipping the default fill avoids flicker.
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.DrawImageUnscaled(_frozen, 0, 0);
            using (var dim = new SolidBrush(Color.FromArgb(110, 0, 0, 0)))
            {
                if (_rect.Width > 0 && _rect.Height > 0)
                {
                    using (var outside = new Region(ClientRectangle))
                    {
                        outside.Exclude(_rect);
                        g.FillRegion(dim, outside);
                    }
                    using (var pen = new Pen(Color.FromArgb(59, 130, 246), 2))
                    {
                        g.DrawRectangle(pen, _rect);
                    }
                    string size = _rect.Width + " x " + _rect.Height;
                    using (var font = new Font("Segoe UI", 9f))
                    using (var bg = new SolidBrush(Color.FromArgb(200, 15, 23, 42)))
                    {
                        SizeF textSize = g.MeasureString(size, font);
                        float ty = _rect.Top - textSize.Height - 4 < 0 ? _rect.Bottom + 4 : _rect.Top - textSize.Height - 4;
                        g.FillRectangle(bg, _rect.Left, ty, textSize.Width + 8, textSize.Height + 2);
                        g.DrawString(size, font, Brushes.White, _rect.Left + 4, ty + 1);
                    }
                }
                else
                {
                    g.FillRectangle(dim, ClientRectangle);
                }
            }
        }
    }
}
