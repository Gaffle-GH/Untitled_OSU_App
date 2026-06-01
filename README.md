# Untitled osu! Application

A command-line tool for fetching details and downloading osu! beatmaps and song previews. This application interacts with the osu! API to retrieve beatmap data and uses various mirror services for reliable beatmap file downloads.

## Features

-   **Fetch Beatmap Details**: Retrieve comprehensive details for any beatmap by providing its ID, including title, artist, difficulty, BPM, and status.
-   **Beatmap Downloader**: Downloads the complete `.osz` beatmap file by cycling through multiple mirror services (`nerinyan.moe`, `beatconnect.io`, `kitsu.moe`) for reliability.
-   **Song Preview**: Downloads a `.mp3` preview of the beatmap's song.
-   **Auto-Play**: Automatically opens the downloaded song preview using the system's default media player (supports macOS, Windows, and Linux).
-   **Comprehensive Test Suite**: Includes a testing framework to validate beatmap fetching, downloading, and file extraction logic against a set of predefined test cases.
-   **Background Art Extraction**: The test functions can extract background images (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tiff`) from downloaded `.osz` files.

## Project Structure

```
.
├── download/               # Default location for downloaded .osz files
├── include/
│   ├── const.py            # Console color constants
│   └── cred.py             # osu! API client credentials and initialization
├── previews/               # Default location for song previews and extracted art
├── src/
│   ├── main.py             # Main application entry point
│   ├── Makefile            # Makefile for running the application and cleaning up
│   └── TEST/               # Directory for the test suite
│       ├── test_cases.py   # Main script to run all test cases
│       └── test_functions.py # Core testing logic
├── pyproject.toml
└── requirements.txt
```

## Setup and Usage

This project requires Python 3.13.

### Running the Application

1.  Clone the repository:
    ```sh
    git clone https://github.com/gaffle-gh/untitled_osu_app.git
    cd untitled_osu_app
    ```

2.  Navigate to the `src` directory:
    ```sh
    cd src
    ```

3.  Use the `Makefile` to set up the environment and run the application. This command will automatically create a virtual environment and install the required dependencies.
    ```sh
    make run
    ```
4.  Follow the on-screen prompt to enter a beatmap ID.

The application will fetch the beatmap details, download the `.osz` file to the `download/` directory, and save the song preview to the `previews/` directory before attempting to play it.

### Running the Test Suite

The repository includes a test suite to ensure all functionalities work as expected.

1.  Navigate to the test directory from the project root:
    ```sh
    cd src/TEST
    ```

2.  Use the `Makefile` in the `TEST` directory to run the tests:
    ```sh
    make run
    ```

The script will execute a series of tests against predefined beatmap IDs, providing a summary of passed and failed cases with detailed logging.

### Cleaning Up

To remove the virtual environment and cached files, you can use the `clean` command in either the `src` or `src/TEST` Makefiles.

From the `src` directory:
```sh
make clean
