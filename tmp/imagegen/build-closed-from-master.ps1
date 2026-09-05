Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$sourcePath = Join-Path $PSScriptRoot '..\..\assets\characters\teppou\east\east_master_review.png'
$southeastPath = Join-Path $PSScriptRoot '..\..\assets\characters\teppou\southeast\walk_02.png'
$outputPath = Join-Path $PSScriptRoot '..\..\assets\characters\teppou\east\walk_02.png'

$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePath))
$southeast = [System.Drawing.Bitmap]::FromFile((Resolve-Path $southeastPath))
try {
    $output = New-Object System.Drawing.Bitmap(
        $source.Width,
        $source.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
        # Preserve the approved character through roughly one logical pixel
        # below the white belt. Everything above this line is exact master.
        for ($y = 0; $y -lt 870; $y++) {
            for ($x = 0; $x -lt $source.Width; $x++) {
                $output.SetPixel($x, $y, $source.GetPixel($x, $y))
            }
        }

        # A single short shared hip block immediately below the preserved area.
        for ($y = 870; $y -le 900; $y++) {
            $sampleY = 847 + ($y - 870)
            for ($x = 327; $x -le 705; $x++) {
                $pixel = $southeast.GetPixel($x, $sampleY)
                if ($pixel.A -le 10) {
                    $pixel = [System.Drawing.Color]::FromArgb(253, 84, 84, 86)
                }
                $output.SetPixel($x, $y, $pixel)
            }
        }

        # Two thick closed legs descend vertically. Sample the approved
        # southeast closed frame so the checker pattern naturally fades into
        # broad gray legs without an explicit crotch outline.
        for ($y = 901; $y -le 1023; $y++) {
            $sampleY = 910 + ($y - 901)
            for ($x = 365; $x -le 705; $x++) {
                $pixel = $southeast.GetPixel($x, $sampleY)
                if ($pixel.A -le 10) {
                    $pixel = [System.Drawing.Color]::FromArgb(253, 82, 82, 84)
                }
                $output.SetPixel($x, $y, $pixel)
            }
        }

        # Reuse the approved right-facing ankle/sock shape twice so both legs
        # meet the already approved shoes cleanly.
        for ($y = 1024; $y -le 1055; $y++) {
            for ($x = 503; $x -le 820; $x++) {
                $pixel = $source.GetPixel($x, $y)
                if ($pixel.A -le 10) { continue }
                $output.SetPixel($x - 205, $y, $pixel)
                $output.SetPixel($x - 35, $y, $pixel)
            }
        }

        # Preserve the approved shoe silhouette: two touching flat-soled
        # trapezoids, short on top and wider on the lower row.
        for ($y = 1056; $y -le 1088; $y++) {
            if ($y -le 1064) {
                $leftStart = 400
                $rightEnd = 705
            } else {
                $leftStart = 365
                $rightEnd = 741
            }

            $leftSample = $source.GetPixel(620, [Math]::Min($y, 1087))
            $rightSample = $source.GetPixel(710, [Math]::Min($y, 1087))
            $leftColor = [System.Drawing.Color]::FromArgb(253, $leftSample.R, $leftSample.G, $leftSample.B)
            $rightColor = [System.Drawing.Color]::FromArgb(253, $rightSample.R, $rightSample.G, $rightSample.B)

            for ($x = $leftStart; $x -le 535; $x++) {
                $output.SetPixel($x, $y, $leftColor)
            }
            for ($x = 536; $x -le $rightEnd; $x++) {
                $output.SetPixel($x, $y, $rightColor)
            }

            $divider = [System.Drawing.Color]::FromArgb(253, 8, 8, 8)
            $output.SetPixel(535, $y, $divider)
            $output.SetPixel(536, $y, $divider)
        }

        $output.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $output.Dispose()
    }
} finally {
    $southeast.Dispose()
    $source.Dispose()
}
