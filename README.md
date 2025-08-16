# unFold

**unFold** is a Firefox extension for foldable Android devices, designed to automatically switch websites between their mobile and desktop layouts as you fold and unfold your screen.

It intelligently injects a desktop User-Agent when the screen is unfolded to make websites provide a desktop experience, and reverts this when the screen is folded back to ensure the best mobile experience. For websites that don't respond to a simple User-Agent change, it provides powerful URL redirection functionality.

## ✨ Key Features

* **Automatic Mode Switching**: Seamlessly transitions between mobile and desktop site versions based on the screen's folded/unfolded state.
* **User-Agent Injection**: Pretends to be a desktop browser on unfolded screens, tricking websites into serving their desktop layout.
* **Powerful URL Redirection**: Uses customizable regex rules to force specific mobile/desktop URLs for sites that don't respond to User-Agent changes alone.
* **Flexible Modes**:
    * **Auto (Denylist Mode)**: Automatically switches modes for all sites, except those in your denylist.
    * **Auto (Allowlist Mode)**: Switches modes only for sites in your allowlist.
    * **Always Desktop**: Forces the desktop version on all websites, regardless of the screen's state (except for sites in the denylist).
    * **Off**: Disables all functionality.
* **Auto-Refresh**: Automatically reloads the page when the mode changes to instantly display the correct site version.
* **List Management**: Easily add or remove the current website from your denylist or allowlist directly from the popup.

## 🚀 Installation

1.  Download the latest `.xpi` file from the [Releases](https://github.com/jjhitel/unFold/releases) page.
2.  Open Firefox on your Android device.
3.  Go to `Settings` -> `Add-ons`.
4.  Tap the `Install Add-on from file` button and select the `.xpi` file you downloaded.

## 🛠️ How to Use

`unFold` works in the background once installed. You can manage its behavior through the popup menu by tapping the extension icon in your Firefox toolbar.

1.  **Open the Popup**: Tap the `unFold` icon.
2.  **Choose a Mode**:
    * Use the main toggle to switch between your last used mode and **Off**.
    * Go to **Settings** to choose between **Auto (Denylist Mode)**, **Auto (Allowlist Mode)**, or **Always Desktop**.
3.  **Manage Lists**:
    * While on a website, open the popup and click the `+ Add to Denylist` or `+ Add to Allowlist` button to quickly manage the site's behavior.
    * If a site is already on a list, the button will change to `Remove from...` allowing you to easily undo the action.
4.  **Configure Advanced Settings**:
    * Open **Settings** to access advanced features like custom URL redirect rules, the unfolded screen width threshold, and a custom desktop User-Agent string.

## 🤝 Contributing

Contributions are welcome! This project was largely developed with the assistance of AI (99% machine-generated code), so there is always room for human touch and improvement. If you have ideas for new features, find a bug, or see an opportunity to refactor the code, please feel free to open an issue or submit a pull request.

## License

`unFold` is licensed under the **GNU General Public License v3.0**.